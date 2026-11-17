"use server";

import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/notify";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
});

export interface ForgotPasswordState {
  message?: string;
  error?: string;
}

export async function forgotPasswordAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email" };
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  // Always return success to avoid leaking which emails are registered.
  if (!user || user.status === "DISABLED") {
    return { message: "If that email is registered, a reset link has been sent." };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: token,
      passwordResetTokenExpiresAt: expiresAt,
    },
  });

  const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/login/reset-password?token=${token}`;

  // Send via notify pipeline for tenant users; platform staff have no tenantId
  // so the Message FK would fail — skip in-app for them (email channel still fires).
  if (user.tenantId) {
    await notify({
      tenantId: user.tenantId,
      recipientUserId: user.id,
      category: "SECURITY",
      dataClassification: "SENSITIVE",
      title: "Password reset request",
      body: `You requested a password reset. Use this link within 1 hour: ${resetUrl}`,
      dedupeKey: `pwd_reset:${user.id}:${token.slice(0, 8)}`,
      urgent: true,
    });
  }

  return { message: "If that email is registered, a reset link has been sent." };
}
