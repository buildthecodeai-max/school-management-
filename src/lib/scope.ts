import "server-only";
import type { AuthzContext } from "./rbac";
import { campusScopeFor } from "./rbac";
import type { PermissionKey } from "./permissions";

// Builds a Prisma `where` fragment that enforces BOTH tenant isolation and
// campus scope for a given permission. Every query in the app funnels through
// this so isolation (TEN-002) is applied uniformly.
export function tenantCampusWhere(
  ctx: AuthzContext,
  perm: PermissionKey,
): { tenantId: string; campusId?: { in: string[] } } {
  if (!ctx.tenantId) {
    // Platform staff have no tenant row context; callers must handle this.
    throw new Error("No tenant context for scoped query");
  }
  const scope = campusScopeFor(ctx, perm);
  const where: { tenantId: string; campusId?: { in: string[] } } = {
    tenantId: ctx.tenantId,
  };
  if (scope !== null) {
    where.campusId = { in: scope };
  }
  return where;
}

// Just the campus id list (or null for all campuses in the tenant).
export function allowedCampusIds(
  ctx: AuthzContext,
  perm: PermissionKey,
): string[] | null {
  return campusScopeFor(ctx, perm);
}
