import "server-only";
import { prisma } from "./db";
import { can, canForCampus, type AuthzContext } from "./rbac";
import type { PermissionKey } from "./permissions";
import { effectiveAccess, notGrantable, type AssignmentInput } from "./access";

/** Does the actor hold this permission at the scope (org-wide, or on that campus)? */
export function holdsAt(ctx: AuthzContext, perm: string, campusId: string | null): boolean {
  return campusId ? canForCampus(ctx, perm as PermissionKey, campusId) : can(ctx, perm as PermissionKey);
}

/** The permissions the actor cannot hand out at a scope. */
export function ungrantableAt(ctx: AuthzContext, perms: readonly string[], campusId: string | null): string[] {
  return notGrantable((p) => holdsAt(ctx, p, campusId), perms);
}

export const INVITE_DAYS = 7;

/** A school user and what they currently hold, or null for another school's, platform or unknown users. */
export async function loadSchoolUser(tenantId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, isPlatformStaff: false },
    include: { roleAssignments: { include: { role: true, campus: { select: { id: true, name: true } } } } },
  });
  return user;
}

/**
 * May the actor manage this user at all? Only if the actor manages every scope the user
 * works in and could grant everything the user holds there, so a campus manager cannot
 * touch (or reset the password of) someone with wider or stronger access.
 */
export function canManageUser(ctx: AuthzContext, user: { roleAssignments: { scopeType: string; campusId: string | null; role: { permissions: string[] } }[] }): { ok: true } | { ok: false; reason: string } {
  if (user.roleAssignments.length === 0) {
    return can(ctx, "iam.users.manage") ? { ok: true } : { ok: false, reason: "Only an organization-wide manager can manage accounts with no role." };
  }
  for (const a of user.roleAssignments) {
    const campusId = a.scopeType === "CAMPUS" ? a.campusId : null;
    if (!holdsAt(ctx, "iam.users.manage", campusId)) return { ok: false, reason: "This user has access outside what you manage." };
    const missing = ungrantableAt(ctx, a.role.permissions, campusId);
    if (missing.length > 0) return { ok: false, reason: "This user holds permissions you do not have, so you cannot change their account." };
  }
  return { ok: true };
}

export function assignmentsOf(user: { roleAssignments: { scopeType: string; campusId: string | null; role: { permissions: string[] } }[] }): AssignmentInput[] {
  return user.roleAssignments.map((a) => ({ scopeType: a.scopeType === "CAMPUS" ? "CAMPUS" : "ORG", campusId: a.campusId, permissions: a.role.permissions }));
}
export { effectiveAccess };

/**
 * Active people who can manage users school-wide. A school must always keep at least one,
 * or nobody could ever fix access again.
 */
export async function activeOrgManagers(tenantId: string, opts: { excludeUserId?: string; excludeAssignmentId?: string; excludeRoleId?: string } = {}): Promise<number> {
  const rows = await prisma.user.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      isPlatformStaff: false,
      ...(opts.excludeUserId ? { id: { not: opts.excludeUserId } } : {}),
      roleAssignments: {
        some: {
          scopeType: "ORG",
          ...(opts.excludeAssignmentId ? { id: { not: opts.excludeAssignmentId } } : {}),
          role: { permissions: { has: "iam.users.manage" }, ...(opts.excludeRoleId ? { id: { not: opts.excludeRoleId } } : {}) },
        },
      },
    },
    select: { id: true },
  });
  return rows.length;
}
