"use server";

import { revalidatePath } from "next/cache";
import { authenticator } from "@otplib/preset-default";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface MfaActionState {
  ok?: boolean;
  error?: string;
  secret?: string;
  qrUrl?: string;
}

// SEC-002: Generate a new TOTP secret and return the provisioning URI for QR rendering.
export async function enrollMfa(_prev: MfaActionState): Promise<MfaActionState> {
  const ctx = await requireUser();
  const secret = authenticator.generateSecret();
  const uri = authenticator.keyuri(ctx.user.email, "Scholarum", secret);

  // Store secret as unconfirmed until the user verifies the first code.
  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { mfaSecret: `pending:${secret}` },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "mfa.enroll.started",
    targetType: "User",
    targetId: ctx.user.id,
    metadata: {},
  });

  return { ok: true, secret, qrUrl: uri };
}

// SEC-002: Verify the code against the pending secret and promote it to active.
export async function verifyMfa(
  _prev: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const ctx = await requireUser();
  const code = String(formData.get("code") ?? "").trim();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  const storedSecret = user.mfaSecret ?? "";
  if (!storedSecret.startsWith("pending:")) {
    return { error: "No pending MFA enrollment. Start enrollment first." };
  }

  const secret = storedSecret.slice("pending:".length);
  const valid = authenticator.verify({ token: code, secret });
  if (!valid) return { error: "Invalid code. Try again." };

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { mfaSecret: secret },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "mfa.enrolled",
    targetType: "User",
    targetId: ctx.user.id,
    metadata: {},
  });

  revalidatePath("/portal/settings/security");
  return { ok: true };
}

// SEC-002: Disable MFA — requires the current TOTP code.
export async function disableMfa(
  _prev: MfaActionState,
  formData: FormData,
): Promise<MfaActionState> {
  const ctx = await requireUser();
  const code = String(formData.get("code") ?? "").trim();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
  const secret = user.mfaSecret;
  if (!secret || secret.startsWith("pending:")) {
    return { error: "MFA is not currently enabled." };
  }

  const valid = authenticator.verify({ token: code, secret });
  if (!valid) return { error: "Invalid code. Cannot disable MFA." };

  await prisma.user.update({
    where: { id: ctx.user.id },
    data: { mfaSecret: null },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "mfa.disabled",
    targetType: "User",
    targetId: ctx.user.id,
    metadata: {},
  });

  revalidatePath("/portal/settings/security");
  return { ok: true };
}
