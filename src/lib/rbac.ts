import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "./auth";
import { WILDCARD, type PermissionKey } from "./permissions";
import { ALL_PERMISSIONS } from "./permissions";
import { cookies } from "next/headers";
import { prisma } from "./db";

// Resolved authorization context derived from a user's role assignments.
export interface AuthzContext {
  user: SessionUser;
  isPlatformStaff: boolean;
  tenantId: string | null;
  // union of all permission keys across every assignment
  permissions: Set<string>;
  // permissions restricted to a specific campus (in addition to org-wide)
  campusPermissions: Map<string, Set<string>>;
  // campuses the user has ANY assignment on
  campusIds: string[];
  hasOrgScope: boolean;
  // true when the tenant is SUSPENDED and this user is not platform staff
  // (TEN-005). Suspension blocks interactive use while preserving billing,
  // export, support and recovery operations — see ALLOWED_DURING_SUSPENSION.
  isSuspended: boolean;
  // Set to the impersonator's own user id while a platform staff member is
  // viewing as this user (IAM-004); null for a normal session.
  impersonatedByUserId: string | null;
  operatorCampusId?: string | null;
}

// Permissions that remain usable while a tenant is suspended: viewing/paying
// the subscription (so the tenant can get itself reactivated) and audit
// review (so support can diagnose the account without lifting suspension).
const ALLOWED_DURING_SUSPENSION: readonly PermissionKey[] = [
  "billing.read",
  "billing.manage",
  "audit.read",
];

export function resolveAuthz(user: SessionUser): AuthzContext {
  const permissions = new Set<string>();
  const campusPermissions = new Map<string, Set<string>>();
  const campusIds = new Set<string>();
  let hasOrgScope = false;

  for (const a of user.roleAssignments) {
    const perms = a.role.permissions;
    if (a.scopeType === "CAMPUS" && a.campusId) {
      campusIds.add(a.campusId);
      const set = campusPermissions.get(a.campusId) ?? new Set<string>();
      perms.forEach((p) => set.add(p));
      campusPermissions.set(a.campusId, set);
    } else {
      // PLATFORM or ORG scope grants org-wide
      if (a.scopeType === "ORG") hasOrgScope = true;
      perms.forEach((p) => permissions.add(p));
    }
  }

  return {
    user,
    isPlatformStaff: user.isPlatformStaff,
    tenantId: user.tenantId,
    permissions,
    campusPermissions,
    campusIds: [...campusIds],
    hasOrgScope,
    isSuspended: !user.isPlatformStaff && user.tenant?.status === "SUSPENDED",
    impersonatedByUserId: user.impersonatedByUserId,
  };
}

// Single choke point for TEN-005: every permission check in the app routes
// through `can()` or `canForCampus()` (directly, or via `campusScopeFor()`
// which both `assertPermission`/`requirePermission` and most `actions.ts`
// files call), so gating suspension here — rather than only in the two
// guard functions — covers every existing and future call site uniformly.
function blockedBySuspension(ctx: AuthzContext, perm: PermissionKey): boolean {
  return ctx.isSuspended && !ALLOWED_DURING_SUSPENSION.includes(perm);
}

// Does the user hold a permission org-wide (or via wildcard)?
export function can(ctx: AuthzContext, perm: PermissionKey): boolean {
  if (perm.startsWith("platform.") && !ctx.isPlatformStaff) return false;
  if (blockedBySuspension(ctx, perm)) return false;
  if (ctx.permissions.has(WILDCARD)) return true;
  return ctx.permissions.has(perm);
}

// Does the user hold a permission for a specific campus (org-wide counts)?
export function canForCampus(
  ctx: AuthzContext,
  perm: PermissionKey,
  campusId: string,
): boolean {
  if (perm.startsWith("platform.")) return can(ctx, perm);
  if (ctx.operatorCampusId && ctx.operatorCampusId !== campusId) return false;
  if (blockedBySuspension(ctx, perm)) return false;
  if (can(ctx, perm)) return true;
  const set = ctx.campusPermissions.get(campusId);
  if (!set) return false;
  return set.has(WILDCARD) || set.has(perm);
}

// Does the user hold a permission on every one of these campuses? Used for
// tenant-wide configuration that changes all campuses at once.
export function canOnAll(ctx: AuthzContext, perm: PermissionKey, campusIds: string[]): boolean {
  return campusIds.length > 0 && campusIds.every((id) => canForCampus(ctx, perm, id));
}

// Does the user hold a permission ANYWHERE — org-wide or on any single campus?
// Use this for UI-shaping decisions (which dashboard to render, whether to show
// a nav entry). `can()` alone is org-wide only, so it answers "false" for the
// campus-scoped roles most staff actually have.
export function canAnywhere(ctx: AuthzContext, perm: PermissionKey): boolean {
  if (perm.startsWith("platform.")) return can(ctx, perm);
  if (blockedBySuspension(ctx, perm)) return false;
  if (can(ctx, perm)) return true;
  for (const set of ctx.campusPermissions.values()) {
    if (set.has(WILDCARD) || set.has(perm)) return true;
  }
  return false;
}

// The set of campus ids a user may act on for a given permission.
// Returns null to mean "all campuses in tenant" (org-wide grant).
export function campusScopeFor(
  ctx: AuthzContext,
  perm: PermissionKey,
): string[] | null {
  if (perm.startsWith("platform.")) return can(ctx, perm) ? null : [];
  if (blockedBySuspension(ctx, perm)) return [];
  if (ctx.operatorCampusId) return canAnywhere(ctx, perm) ? [ctx.operatorCampusId] : [];
  if (can(ctx, perm)) return null; // org-wide
  const ids: string[] = [];
  for (const [campusId, set] of ctx.campusPermissions) {
    if (set.has(WILDCARD) || set.has(perm)) ids.push(campusId);
  }
  return ids;
}

// ---- Guards for server components / actions -------------------------------

export async function requireUser(): Promise<AuthzContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = resolveAuthz(user);
  if (!ctx.isPlatformStaff || !can(ctx, "platform.manage")) return ctx;
  const jar = await cookies();
  const tenantId = jar.get("sms_operator_tenant")?.value;
  if (!tenantId) return ctx;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return ctx;
  const campusId = jar.get("sms_operator_campus")?.value;
  if (campusId && !(await prisma.campus.findFirst({ where: { id: campusId, tenantId } }))) return ctx;
  ctx.tenantId = tenant.id;
  ctx.user = { ...user, tenantId: tenant.id, tenant };
  ctx.hasOrgScope = !campusId;
  ctx.operatorCampusId = campusId ?? null;
  if (campusId) {
    ctx.permissions = new Set(ALL_PERMISSIONS.filter(p => p.startsWith("platform.") && can(resolveAuthz(user), p)));
    ctx.campusPermissions = new Map([[campusId, new Set(ALL_PERMISSIONS.filter(p => !p.startsWith("platform.")))]]);
    ctx.campusIds = [campusId];
  } else {
    ALL_PERMISSIONS.filter(p => !p.startsWith("platform.")).forEach(p => ctx.permissions.add(p));
  }
  return ctx;
}

export async function requirePermission(
  perm: PermissionKey,
): Promise<AuthzContext> {
  const ctx = await requireUser();
  if (blockedBySuspension(ctx, perm)) {
    redirect("/portal/suspended");
  }
  // Platform staff have no tenant row, so every tenant-scoped query in the
  // pages behind this guard would fail on a null tenantId. Send them to the
  // platform console instead, where they pick a tenant to work in.
  if (!ctx.tenantId && ctx.isPlatformStaff) {
    redirect("/portal/platform");
  }
  // Allow if held org-wide OR on at least one campus.
  const scope = campusScopeFor(ctx, perm);
  const allowed = scope === null || scope.length > 0;
  if (!allowed) redirect("/portal?denied=" + encodeURIComponent(perm));
  return ctx;
}

export function assertPermission(ctx: AuthzContext, perm: PermissionKey): void {
  if (blockedBySuspension(ctx, perm)) {
    throw new Error(
      "This organization's subscription is suspended. Only billing and support operations are available until it is reactivated.",
    );
  }
  const scope = campusScopeFor(ctx, perm);
  const allowed = scope === null || scope.length > 0;
  if (!allowed) {
    throw new Error(`Forbidden: missing permission ${perm}`);
  }
}
