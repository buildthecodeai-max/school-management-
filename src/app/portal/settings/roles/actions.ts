"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser, can } from "@/lib/rbac";
import { isStandardRoleName, validateRolePermissions } from "@/lib/access";
import { activeOrgManagers, ungrantableAt } from "@/lib/access-server";

export interface RoleActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  roleId?: string;
}

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

// Role definitions are reusable at any scope, so editing them needs organization-wide rights.
async function roleAdmin() {
  const ctx = await requireUser();
  if (!ctx.tenantId) return { error: "Select a school first." as const };
  if (!can(ctx, "iam.roles.manage")) return { error: "Only an organization-wide role manager can change roles." as const };
  return { ctx, tenantId: ctx.tenantId };
}

function checkName(name: string): string | null {
  if (name.length < 2 || name.length > 60) return "Give the role a name of 2 to 60 characters.";
  if (isStandardRoleName(name)) return `"${name}" is a built-in role name. Choose another.`;
  return null;
}

function picked(f: FormData) {
  return validateRolePermissions(f.getAll("permissions"));
}

export async function createRole(_p: RoleActionState, f: FormData): Promise<RoleActionState> {
  const a = await roleAdmin();
  if ("error" in a) return { error: a.error };
  const name = str(f, "name", 60);
  const bad = checkName(name);
  if (bad) return { error: bad };
  const perms = picked(f);
  if (!perms.ok) return { error: perms.error };
  const missing = ungrantableAt(a.ctx, perms.permissions, null);
  if (missing.length) return { error: `You cannot include permissions you do not hold yourself (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}).` };
  if (await prisma.role.findFirst({ where: { tenantId: a.tenantId, name } })) return { error: `A role named "${name}" already exists.` };
  const role = await prisma.role.create({ data: { tenantId: a.tenantId, name, description: str(f, "description", 200) || null, permissions: perms.permissions } });
  await audit({ tenantId: a.tenantId, actorUserId: a.ctx.user.id, action: "iam.role.created", targetType: "Role", targetId: role.id, scopeType: "ORG", metadata: { name, permissions: perms.permissions.length } });
  revalidatePath("/portal/settings/roles");
  return { ok: true, message: `Role "${name}" created.`, roleId: role.id };
}

export async function updateRole(_p: RoleActionState, f: FormData): Promise<RoleActionState> {
  const a = await roleAdmin();
  if ("error" in a) return { error: a.error };
  const role = await prisma.role.findFirst({ where: { id: str(f, "roleId", 40), tenantId: a.tenantId }, include: { _count: { select: { assignments: true } } } });
  if (!role) return { error: "Role not found." };
  if (isStandardRoleName(role.name)) return { error: "Built-in roles cannot be edited. Duplicate it and change the copy." };
  const name = str(f, "name", 60);
  const bad = name === role.name ? null : checkName(name);
  if (bad) return { error: bad };
  const perms = picked(f);
  if (!perms.ok) return { error: perms.error };
  // You can only manage a role whose every permission (old and new) you hold.
  const missing = ungrantableAt(a.ctx, [...new Set([...role.permissions, ...perms.permissions])], null);
  if (missing.length) return { error: `This role includes permissions you do not hold yourself (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}), so you cannot change it.` };
  if (name !== role.name && (await prisma.role.findFirst({ where: { tenantId: a.tenantId, name, id: { not: role.id } } }))) return { error: `A role named "${name}" already exists.` };
  // Do not let an edit strip the last manager of their management rights.
  if (role.permissions.includes("iam.users.manage") && !perms.permissions.includes("iam.users.manage") && (await activeOrgManagers(a.tenantId, { excludeRoleId: role.id })) === 0)
    return { error: "This role is what gives the school's only organization-wide manager their access. Keep that permission or give someone else a manager role first." };

  await prisma.role.update({ where: { id: role.id }, data: { name, description: str(f, "description", 200) || null, permissions: perms.permissions } });
  await audit({ tenantId: a.tenantId, actorUserId: a.ctx.user.id, action: "iam.role.updated", targetType: "Role", targetId: role.id, scopeType: "ORG", metadata: { name, added: perms.permissions.filter((p) => !role.permissions.includes(p)), removed: role.permissions.filter((p) => !(perms.permissions as string[]).includes(p)), assignedTo: role._count.assignments } });
  revalidatePath("/portal/settings/roles");
  revalidatePath(`/portal/settings/roles/${role.id}`);
  return { ok: true, message: role._count.assignments ? `Saved. The change applies to ${role._count.assignments} assignment(s) right away.` : "Saved." };
}

export async function duplicateRole(_p: RoleActionState, f: FormData): Promise<RoleActionState> {
  const a = await roleAdmin();
  if ("error" in a) return { error: a.error };
  const role = await prisma.role.findFirst({ where: { id: str(f, "roleId", 40), tenantId: a.tenantId } });
  if (!role) return { error: "Role not found." };
  const missing = ungrantableAt(a.ctx, role.permissions, null);
  if (missing.length) return { error: "This role includes permissions you do not hold yourself, so you cannot copy it." };
  let name = `${role.name} (copy)`;
  for (let i = 2; await prisma.role.findFirst({ where: { tenantId: a.tenantId, name } }); i++) name = `${role.name} (copy ${i})`;
  const copy = await prisma.role.create({ data: { tenantId: a.tenantId, name, description: role.description, permissions: role.permissions } });
  await audit({ tenantId: a.tenantId, actorUserId: a.ctx.user.id, action: "iam.role.created", targetType: "Role", targetId: copy.id, scopeType: "ORG", metadata: { name, copiedFrom: role.name } });
  revalidatePath("/portal/settings/roles");
  return { ok: true, message: `Created "${name}". Open it to adjust the permissions.`, roleId: copy.id };
}

export async function deleteRole(_p: RoleActionState, f: FormData): Promise<RoleActionState> {
  const a = await roleAdmin();
  if ("error" in a) return { error: a.error };
  const role = await prisma.role.findFirst({ where: { id: str(f, "roleId", 40), tenantId: a.tenantId }, include: { _count: { select: { assignments: true } } } });
  if (!role) return { error: "Role not found." };
  if (isStandardRoleName(role.name)) return { error: "Built-in roles cannot be deleted." };
  if (role._count.assignments > 0) return { error: `${role._count.assignments} assignment(s) still use this role. Move those people to another role first.` };
  await prisma.role.delete({ where: { id: role.id } });
  await audit({ tenantId: a.tenantId, actorUserId: a.ctx.user.id, action: "iam.role.deleted", targetType: "Role", targetId: role.id, scopeType: "ORG", metadata: { name: role.name } });
  revalidatePath("/portal/settings/roles");
  return { ok: true, message: `Role "${role.name}" deleted.` };
}
