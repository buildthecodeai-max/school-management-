"use server";

import { redirect } from "next/navigation";
import { authenticator } from "@otplib/preset-default";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { completeMfaSession, destroySession, getPendingMfaSession } from "@/lib/auth";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/login-rate-limit";

export interface MfaLoginState {
  error?: string;
}

// ±1 step (30 s) tolerates ordinary clock drift between phone and server.
const totp = authenticator.clone({ window: 1 });

export async function verifyLoginMfaAction(
  _prev: MfaLoginState,
  formData: FormData,
): Promise<MfaLoginState> {
  const pending = await getPendingMfaSession();
  if (!pending) redirect("/login");
  const { user, sessionId } = pending;

  const key = `mfa:${user.id}`;
  const rl = checkLoginRateLimit(key);
  if (!rl.allowed) {
    await audit({ tenantId: user.tenantId, actorUserId: user.id, action: "auth.mfa", outcome: "DENIED" });
    await destroySession();
    redirect("/login");
  }

  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  let valid = false;
  try {
    valid = /^\d{6}$/.test(code) && totp.verify({ token: code, secret: user.mfaSecret! });
  } catch {
    valid = false;
  }
  if (!valid) {
    await audit({ tenantId: user.tenantId, actorUserId: user.id, action: "auth.mfa", outcome: "FAILURE" });
    return { error: "That code is not valid. Check your authenticator app and try again." };
  }

  resetLoginRateLimit(key);
  await completeMfaSession(sessionId);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ tenantId: user.tenantId, actorUserId: user.id, action: "auth.mfa", outcome: "SUCCESS" });
  redirect("/portal");
}

export async function cancelMfaAction() {
  await destroySession();
  redirect("/login");
}
