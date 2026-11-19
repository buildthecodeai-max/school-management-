"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { requireUser, can } from "@/lib/rbac";
import { syncSeats } from "@/lib/entitlements";
import { INVITE_DAYS, activeOrgManagers, canManageUser, holdsAt, loadSchoolUser, ungrantableAt } from "@/lib/access-server";

export interface UserActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  inviteUrl?: string;
}

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const inviteUrl = (token: string) => `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/login/reset-password?token=${token}`;

async function validScope(tenantId: string, f: FormData): Promise<{ scopeType: "ORG" | "CAMPUS"; campusId: string | null } | { error: string }> {
  const scopeType = str(f, "scopeType", 10) === "CAMPUS" ? "CAMPUS" : "ORG";
  if (scopeType === "ORG") return { scopeType, campusId: null };
  const campusId = str(f, "campusId", 40);
  if (!campusId || !(await prisma.campus.findFirst({ where: { id: campusId, tenantId }, select: { id: true } }))) return { error: "Choose a campus from this school." };
  return { scopeType, campusId };
}

/** Rights needed to give a role at a scope: manage users there, and hold everything in the role. */
function mayGrant(ctx: Awaited<ReturnType<typeof requireUser>>, role: { name: string; permissions: string[] }, campusId: string | null): string | null {
  if (!holdsAt(ctx, "iam.users.manage", campusId)) return campusId ? "You do not manage users on that campus." : "Only an organization-wide manager can give organization-wide roles.";
  const missing = ungrantableAt(ctx, role.permissions, campusId);
  if (missing.length > 0) return `You cannot give "${role.name}": it includes ${missing.length} permission(s) you do not hold yourself (for example ${missing[0]}).`;
  return null;
}

export async function createSchoolUser(_p: UserActionState, f: FormData): Promise<UserActionState> {
  const ctx = await requireUser();
  if (!ctx.tenantId) return { error: "Select a school first." };
  const email = str(f, "email", 160).toLowerCase();
  const displayName = str(f, "displayName", 120);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (displayName.length < 2) return { error: "Enter the person's name." };
  const profile = str(f, "profile", 10);
  if (!["STAFF", "GUARDIAN", "NONE"].includes(profile)) return { error: "Choose a profile type." };

  const scope = await validScope(ctx.tenantId, f);
  if ("error" in scope) return { error: scope.error };
  // Roles belong to this school; system roles (no school) are never grantable.
  const role = await prisma.role.findFirst({ where: { id: str(f, "roleId", 40), tenantId: ctx.tenantId } });
  if (!role) return { error: "Choose a role from this school." };
  const denied = mayGrant(ctx, role, scope.campusId);
  if (denied) return { error: denied };
  if (await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } })) return { error: `${email} already has an account.` };

  const token = randomBytes(32).toString("hex");
  const [first, ...rest] = displayName.split(/\s+/);
  const tenantId = ctx.tenantId;
  const personData = profile === "NONE" ? null : {
    tenant: { connect: { id: tenantId } }, firstName: first, lastName: rest.join(" "), email,
    ...(profile === "GUARDIAN" ? { guardian: { create: { tenantId } } } : { staff: { create: { tenantId, employeeNumber: `STAFF-${randomBytes(6).toString("hex")}` } } }),
  };
  const user = await prisma.user.create({
    data: {
      tenant: { connect: { id: tenantId } },
      email,
      displayName,
      // Nobody knows this password; the person chooses theirs through the invite link.
      passwordHash: await hashPassword(randomBytes(24).toString("hex")),
      status: "ACTIVE",
      passwordResetToken: token,
      passwordResetTokenExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      ...(personData ? { person: { create: personData } } : {}),
      roleAssignments: { create: { roleId: role.id, scopeType: scope.scopeType, campusId: scope.campusId } },
    },
  });
  await syncSeats(ctx.tenantId);
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "iam.user.created", targetType: "User", targetId: user.id, campusId: scope.campusId ?? undefined, scopeType: scope.scopeType, metadata: { email, role: role.name, profile } });
  revalidatePath("/portal/settings/users");
  return { ok: true, message: `${displayName} was added as ${role.name}. Send them this link; it works once and expires in ${INVITE_DAYS} days.`, inviteUrl: inviteUrl(token) };
}

export async function grantRole(_p: UserActionState, f: FormData): Promise<UserActionState> {
  const ctx = await requireUser();
  if (!ctx.tenantId) return { error: "Select a school first." };
  const target = await loadSchoolUser(ctx.tenantId, str(f, "userId", 40));
  if (!target) return { error: "User not found." };
  if (target.id === ctx.user.id) return { error: "You cannot change your own access." };
  const manageable = canManageUser(ctx, target);
  if (!manageable.ok) return { error: manageable.reason };
  const scope = await validScope(ctx.tenantId, f);
  if ("error" in scope) return { error: scope.error };
  const role = await prisma.role.findFirst({ where: { id: str(f, "roleId", 40), tenantId: ctx.tenantId } });
  if (!role) return { error: "Choose a role from this school." };
  const denied = mayGrant(ctx, role, scope.campusId);
  if (denied) return { error: denied };
  if (target.roleAssignments.some((a) => a.roleId === role.id && a.scopeType === scope.scopeType && a.campusId === scope.campusId)) return { error: "They already have that role there." };

  const a = await prisma.roleAssignment.create({ data: { userId: target.id, roleId: role.id, scopeType: scope.scopeType, campusId: scope.campusId } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "iam.role.granted", targetType: "RoleAssignment", targetId: a.id, campusId: scope.campusId ?? undefined, scopeType: scope.scopeType, metadata: { userId: target.id, role: role.name } });
  revalidatePath(`/portal/settings/users/${target.id}`);
  return { ok: true, message: `${role.name} granted.` };
}

export async function revokeRole(_p: UserActionState, f: FormData): Promise<UserActionState> {
  const ctx = await requireUser();
  if (!ctx.tenantId) return { error: "Select a school first." };
  const a = await prisma.roleAssignment.findFirst({ where: { id: str(f, "assignmentId", 40), user: { tenantId: ctx.tenantId, isPlatformStaff: false } }, include: { role: true } });
  if (!a) return { error: "Assignment not found." };
  if (a.userId === ctx.user.id) return { error: "You cannot change your own access." };
  const target = await loadSchoolUser(ctx.tenantId, a.userId);
  if (!target) return { error: "User not found." };
  const manageable = canManageUser(ctx, target);
  if (!manageable.ok) return { error: manageable.reason };
  if (target.roleAssignments.length <= 1) return { error: "That is their only role. Disable the account instead." };
  if (a.scopeType === "ORG" && a.role.permissions.includes("iam.users.manage") && target.status === "ACTIVE" && (await activeOrgManagers(ctx.tenantId, { excludeAssignmentId: a.id })) === 0)
    return { error: "This is the school's last organization-wide manager. Give someone else that access first." };
  await prisma.roleAssignment.delete({ where: { id: a.id } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "iam.role.revoked", targetType: "RoleAssignment", targetId: a.id, campusId: a.campusId ?? undefined, scopeType: a.scopeType, metadata: { userId: a.userId, role: a.role.name } });
  revalidatePath(`/portal/settings/users/${a.userId}`);
  return { ok: true, message: `${a.role.name} removed.` };
}

export async function setUserActive(_p: UserActionState, f: FormData): Promise<UserActionState> {
  const ctx = await requireUser();
  if (!ctx.tenantId) return { error: "Select a school first." };
  const target = await loadSchoolUser(ctx.tenantId, str(f, "userId", 40));
  if (!target) return { error: "User not found." };
  if (target.id === ctx.user.id) return { error: "You cannot disable your own account." };
  const manageable = canManageUser(ctx, target);
  if (!manageable.ok) return { error: manageable.reason };
  const disable = str(f, "to", 10) === "DISABLED";
  if (disable && target.status === "DISABLED") return { error: "Already disabled." };
  if (!disable && target.status !== "DISABLED") return { error: "This account is not disabled." };
  const isManager = target.roleAssignments.some((a) => a.scopeType === "ORG" && a.role.permissions.includes("iam.users.manage"));
  if (disable && isManager && (await activeOrgManagers(ctx.tenantId, { excludeUserId: target.id })) === 0)
    return { error: "This is the school's last organization-wide manager. Give someone else that access first." };

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { status: disable ? "DISABLED" : "ACTIVE" } });
    // A disabled person is signed out everywhere immediately.
    if (disable) await tx.session.deleteMany({ where: { userId: target.id } });
  });
  await syncSeats(ctx.tenantId);
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: disable ? "iam.user.disabled" : "iam.user.enabled", targetType: "User", targetId: target.id, scopeType: "ORG", metadata: { email: target.email } });
  revalidatePath(`/portal/settings/users/${target.id}`);
  revalidatePath("/portal/settings/users");
  return { ok: true, message: disable ? "Account disabled and signed out." : "Account enabled." };
}

/** A fresh one-time link so the person can set (or reset) their password. */
export async function issueInvite(_p: UserActionState, f: FormData): Promise<UserActionState> {
  const ctx = await requireUser();
  if (!ctx.tenantId) return { error: "Select a school first." };
  const target = await loadSchoolUser(ctx.tenantId, str(f, "userId", 40));
  if (!target) return { error: "User not found." };
  if (target.id === ctx.user.id) return { error: "Use the account page to change your own password." };
  if (target.status === "DISABLED") return { error: "Enable the account first." };
  const manageable = canManageUser(ctx, target);
  if (!manageable.ok) return { error: manageable.reason };
  const token = randomBytes(32).toString("hex");
  await prisma.user.update({ where: { id: target.id }, data: { passwordResetToken: token, passwordResetTokenExpiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000) } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "iam.user.invite_issued", targetType: "User", targetId: target.id, scopeType: "ORG", metadata: { email: target.email } });
  return { ok: true, message: `Give ${target.displayName} this link. It works once and expires in ${INVITE_DAYS} days.`, inviteUrl: inviteUrl(token) };
}
