"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

const schema = z.object({
  token: z.string().min(1, "Invalid reset link"),
  newPassword: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "At least one uppercase letter")
    .regex(/[0-9]/, "At least one digit"),
  confirmPassword: z.string(),
});

export interface ResetPasswordState {
  error?: string;
  success?: boolean;
}

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = schema.safeParse({
    token: formData.get("token"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { token, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return { error: "Passwords do not match" };
  }

  const user = await prisma.user.findUnique({
    where: { passwordResetToken: token },
  });

  if (
    !user ||
    user.status === "DISABLED" ||
    !user.passwordResetTokenExpiresAt ||
    user.passwordResetTokenExpiresAt < new Date()
  ) {
    return { error: "This reset link is invalid or has expired." };
  }

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      passwordResetToken: null,
      passwordResetTokenExpiresAt: null,
    },
  });

  // Invalidate all existing sessions so old-password sessions can't persist.
  await prisma.session.deleteMany({ where: { userId: user.id } });

  await audit({
    tenantId: user.tenantId ?? null,
    actorUserId: user.id,
    action: "auth.password_reset",
    outcome: "SUCCESS",
  });

  return { success: true };
}
