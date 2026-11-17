"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, assertPermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function enterOrganization(form: FormData) {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");
  const tenantId = String(form.get("tenantId") ?? "");
  const campusId = String(form.get("campusId") ?? "");
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new Error("Organization not found.");
  if (campusId && !(await prisma.campus.findFirst({ where: { id: campusId, tenantId } }))) throw new Error("Campus does not belong to this organization.");
  await audit({ tenantId, actorUserId: ctx.user.id, action: "platform.context.enter", scopeType: "PLATFORM", campusId: campusId || null });
  const jar = await cookies();
  const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
  jar.set("sms_operator_tenant", tenantId, options);
  if (campusId) jar.set("sms_operator_campus", campusId, options);
  else jar.delete("sms_operator_campus");
  jar.delete("sms_preferred_campus");
  redirect("/portal");
}

export async function leaveOrganization() {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "platform.context.leave", scopeType: "PLATFORM" });
  const jar = await cookies();
  jar.delete("sms_operator_tenant");
  jar.delete("sms_operator_campus");
  jar.delete("sms_preferred_campus");
  redirect("/portal/platform");
}
