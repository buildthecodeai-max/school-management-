"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { verifyPassword, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

const PWD_BREACH_COOKIE = "sms_pwd_breach";

const schema = z.object({
  currentPassword: z.string().min(1, "Required"),
  newPassword: z
    .string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "At least one uppercase letter")
    .regex(/[0-9]/, "At least one digit"),
  confirmPassword: z.string(),
});

export interface ChangePasswordState {
  error?: string;
  message?: string;
}

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const ctx = await requireUser();

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { currentPassword, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match" };
  }
  if (newPassword === currentPassword) {
    return { error: "New password must differ from current password" };
  }

  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
  if (!user) return { error: "User not found" };

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return { error: "Current password is incorrect" };

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { passwordHash: newHash },
  });

  // Clear the breach warning cookie on successful change.
  const jar = await cookies();
  jar.delete(PWD_BREACH_COOKIE);

  await audit({
    tenantId: ctx.tenantId ?? null,
    actorUserId: ctx.user.id,
    action: "auth.password_changed",
    outcome: "SUCCESS",
  });

  return { message: "Password changed successfully." };
}

export async function dismissBreachWarning(): Promise<void> {
  const jar = await cookies();
  jar.delete(PWD_BREACH_COOKIE);
}
