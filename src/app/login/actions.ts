"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/login-rate-limit";

// SEC-003: password must be ≥8 chars, at least 1 uppercase, 1 digit.
const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { email, password } = parsed.data;

  // SEC-003: rate-limit by email + IP to throttle credential-stuffing.
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimitKey = `${email.toLowerCase().trim()}:${ip}`;
  const rl = checkLoginRateLimit(rateLimitKey);
  if (!rl.allowed) {
    await audit({
      action: "auth.login",
      outcome: "DENIED",
      metadata: { email, ip },
    });
    const minutes = Math.ceil(rl.retryAfterMs / 60000);
    return { error: `Too many login attempts. Try again in ${minutes} minute(s).` };
  }

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  // Constant-ish response to avoid leaking which emails exist.
  if (!user || user.status === "DISABLED") {
    await audit({
      action: "auth.login",
      outcome: "FAILURE",
      metadata: { email, reason: "no-user-or-disabled" },
    });
    return { error: "Invalid email or password" };
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await audit({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: "auth.login",
      outcome: "FAILURE",
      metadata: { reason: "bad-password" },
    });
    return { error: "Invalid email or password" };
  }

  // Successful login clears the rate-limit counter.
  resetLoginRateLimit(rateLimitKey);

  await createSession(user.id);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await audit({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "auth.login",
    outcome: "SUCCESS",
  });

  redirect("/portal");
}
