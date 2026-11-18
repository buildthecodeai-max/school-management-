import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const SESSION_COOKIE = "sms_session";
// Holds the impersonator's own (platform staff) session token while they are
// viewing as another user, so ending impersonation restores it exactly —
// no re-login required (IAM-004).
const IMPERSONATOR_COOKIE = "sms_impersonator_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const MFA_PENDING_TTL_MS = 1000 * 60 * 10; // password accepted, code still owed

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

// An active TOTP secret is stored bare; `pending:` marks an unconfirmed enrolment.
export function hasActiveMfa(mfaSecret: string | null | undefined): boolean {
  return !!mfaSecret && !mfaSecret.startsWith("pending:");
}

// With `mfaPending`, the session exists but grants nothing until the user
// completes the second factor (getSessionUser ignores it).
export async function createSession(
  userId: string,
  meta?: { userAgent?: string; ip?: string },
  opts?: { mfaPending?: boolean },
): Promise<string> {
  const token = newSessionToken();
  const ttl = opts?.mfaPending ? MFA_PENDING_TTL_MS : SESSION_TTL_MS;
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt: new Date(Date.now() + ttl),
      userAgent: meta?.userAgent,
      ip: meta?.ip,
      mfaVerified: !opts?.mfaPending,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ttl / 1000,
  });
  return token;
}

// The session that is waiting for its second factor, if any.
export async function getPendingMfaSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.mfaVerified || session.expiresAt < new Date()) return null;
  if (session.user.status === "DISABLED" || !hasActiveMfa(session.user.mfaSecret)) return null;
  return { sessionId: session.id, user: session.user };
}

export async function completeMfaSession(sessionId: string): Promise<void> {
  await prisma.session.update({
    where: { id: sessionId },
    data: { mfaVerified: true, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token)
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete("sms_operator_tenant");
  jar.delete("sms_operator_campus");
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
    jar.delete(SESSION_COOKIE);
  }
}

// Full session subject with tenant, person and role assignments loaded.
export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          tenant: true,
          person: true,
          roleAssignments: {
            include: { role: true, campus: true },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (!session.mfaVerified) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.deleteMany({ where: { token } });
    return null;
  }
  if (session.user.status === "DISABLED") return null;

  return {
    ...session.user,
    // Set only while a platform staff member is impersonating this session
    // (IAM-004) — the impersonator's own user id, not the viewed user's.
    impersonatedByUserId: session.impersonatedByUserId,
  };
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

// ---- Impersonation (IAM-004) -----------------------------------------------
// Platform staff only. The impersonator's own session token is preserved in a
// second cookie so ending impersonation restores it exactly, and every
// audit() call already records the true actor separately from the viewed
// user, so nothing here weakens the audit trail.

export async function startImpersonation(
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const jar = await cookies();
  const actorToken = jar.get(SESSION_COOKIE)?.value;
  if (!actorToken) throw new Error("No active session to impersonate from.");

  const token = newSessionToken();
  await prisma.session.create({
    data: {
      userId: targetUserId,
      token,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      impersonatedByUserId: actorUserId,
    },
  });

  jar.set(IMPERSONATOR_COOKIE, actorToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

// Ends impersonation: deletes the impersonated session and restores the
// impersonator's original session from the secondary cookie. Returns false
// (and does nothing) if the current session isn't actually an impersonation.
export async function endImpersonation(): Promise<boolean> {
  const jar = await cookies();
  const impersonatorToken = jar.get(IMPERSONATOR_COOKIE)?.value;
  const currentToken = jar.get(SESSION_COOKIE)?.value;
  if (!impersonatorToken) return false;

  if (currentToken) {
    await prisma.session.deleteMany({ where: { token: currentToken } });
  }
  jar.set(SESSION_COOKIE, impersonatorToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  jar.delete(IMPERSONATOR_COOKIE);
  return true;
}
