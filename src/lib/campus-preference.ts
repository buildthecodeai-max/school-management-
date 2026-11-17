import "server-only";
import { cookies } from "next/headers";
import type { AuthzContext } from "./rbac";
import type { PermissionKey } from "./permissions";
import { allowedCampusIds } from "./scope";
import { prisma } from "./db";

export const CAMPUS_COOKIE = "sms_preferred_campus";
export const CAMPUS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Decides whether `campusId` may be stored as this user's campus preference.
// Kept separate from the route handler so integration tests can assert the
// authorization directly. A campus is acceptable only when it (a) exists inside
// the caller's own tenant AND (b) the caller either has organization-wide scope
// or holds an assignment on that specific campus.
export async function canPreferCampus(
  ctx: AuthzContext,
  campusId: string,
): Promise<boolean> {
  if (!ctx.tenantId || !campusId) return false;
  const campus = await prisma.campus.findFirst({
    where: { id: campusId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!campus) return false;
  return ctx.hasOrgScope || ctx.campusIds.includes(campusId);
}

// A cookie is client-controlled, so its value is a *preference*, never an
// authorization. Every read re-checks the stored campus against the caller's
// live scope for the permission at hand: a revoked or cross-tenant campus in
// the cookie resolves to null rather than granting access.
export async function preferredCampusId(
  ctx: AuthzContext,
  perm: PermissionKey,
): Promise<string | null> {
  if (!ctx.tenantId) return null;

  const stored = (await cookies()).get(CAMPUS_COOKIE)?.value;
  if (!stored) return null;

  const allowed = allowedCampusIds(ctx, perm);
  if (allowed === null) return stored; // org-wide scope: any campus in the tenant
  return allowed.includes(stored) ? stored : null;
}

// Resolves the campus a campus-scoped page should show: an explicit ?campusId=
// wins, then the remembered preference, then the first campus in scope. The
// explicit param is still validated against `available` by the caller.
export function resolveCampusId(
  explicit: string | undefined,
  preferred: string | null,
  available: { id: string }[],
): string | undefined {
  if (explicit && available.some((c) => c.id === explicit)) return explicit;
  if (preferred && available.some((c) => c.id === preferred)) return preferred;
  return available[0]?.id;
}
