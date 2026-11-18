"use server";

import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { assertPermission, requireUser } from "@/lib/rbac";
import { ProvisionError, provisionSchool } from "@/lib/provision";

export interface ProvisionState {
  error?: string;
  ok?: boolean;
  tenantId?: string;
  inviteUrl?: string;
  adminEmail?: string;
  created?: boolean;
}

export async function provisionTenantAction(_prev: ProvisionState, fd: FormData): Promise<ProvisionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.tenant.provision");
  try {
    const r = await provisionSchool({
      name: String(fd.get("name") ?? ""),
      slug: String(fd.get("slug") ?? ""),
      planId: String(fd.get("planId") ?? ""),
      campusName: String(fd.get("campusName") ?? ""),
      adminEmail: String(fd.get("adminEmail") ?? ""),
      adminName: String(fd.get("adminName") ?? ""),
    });
    const inviteUrl = `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/login/reset-password?token=${r.inviteToken}`;
    await audit({
      tenantId: null,
      actorUserId: ctx.user.id,
      action: "platform.tenant.provisioned",
      targetType: "Tenant",
      targetId: r.tenantId,
      scopeType: "PLATFORM",
      metadata: { adminEmail: r.adminEmail, campusId: r.campusId, created: r.created },
    });
    // The invite is also dropped in the admin's inbox; the operator sees it once, here.
    const tenant = await prisma.tenant.findUnique({ where: { id: r.tenantId }, select: { name: true } });
    await notify({
      tenantId: r.tenantId,
      recipientUserId: r.adminUserId,
      category: "SECURITY",
      dataClassification: "SENSITIVE",
      title: `Set up your ${tenant?.name ?? "school"} account`,
      body: `You have been made the administrator of ${tenant?.name}. Choose your password within 7 days: ${inviteUrl}`,
      dedupeKey: `invite:${r.adminUserId}:${r.inviteToken.slice(0, 8)}`,
      urgent: true,
    });
    return { ok: true, tenantId: r.tenantId, inviteUrl, adminEmail: r.adminEmail, created: r.created };
  } catch (e) {
    if (e instanceof ProvisionError) return { error: e.message };
    throw e;
  }
}
