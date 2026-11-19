// Pure access-management rules (no DB): what a set of role assignments amounts to,
// which permissions a school may put in a role, and what a manager may hand out.
import { ALL_PERMISSIONS, PERMISSIONS, type PermissionKey } from "./permissions";
import { STANDARD_ROLES } from "./school-roles";

export const isPlatformPermission = (p: string) => p === "*" || p.startsWith("platform.");
export const ALL_SCHOOL_PERMISSIONS = ALL_PERMISSIONS.filter((p) => !isPlatformPermission(p));

export type AssignmentInput = { scopeType: "ORG" | "CAMPUS"; campusId: string | null; permissions: readonly string[] };

export type EffectiveAccess = { org: Set<string>; byCampus: Map<string, Set<string>> };

/** What a user can do: permissions held everywhere, plus extra permissions on particular campuses. */
export function effectiveAccess(assignments: AssignmentInput[]): EffectiveAccess {
  const org = new Set<string>();
  const byCampus = new Map<string, Set<string>>();
  // A wildcard role (the owner role in older schools) means every school permission.
  const expand = (perms: readonly string[]) => (perms.includes("*") ? [...perms.filter((p) => p !== "*"), ...ALL_SCHOOL_PERMISSIONS] : perms);
  for (const a of assignments) {
    if (a.scopeType === "ORG") expand(a.permissions).forEach((p) => org.add(p));
    else if (a.campusId) {
      const set = byCampus.get(a.campusId) ?? new Set<string>();
      expand(a.permissions).forEach((p) => set.add(p));
      byCampus.set(a.campusId, set);
    }
  }
  return { org, byCampus };
}

/** Does this access include the permission on the campus (org-wide counts)? */
export function hasOn(access: EffectiveAccess, perm: string, campusId: string | null): boolean {
  if (access.org.has(perm)) return true;
  return !!campusId && !!access.byCampus.get(campusId)?.has(perm);
}

/** A school role may contain only known, non-platform permissions. */
export function validateRolePermissions(input: unknown): { ok: true; permissions: PermissionKey[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) return { ok: false, error: "Choose at least one permission." };
  const unique = [...new Set(input.map(String))];
  for (const p of unique) {
    if (isPlatformPermission(p)) return { ok: false, error: "Platform permissions cannot be given to a school role." };
    if (!(p in PERMISSIONS)) return { ok: false, error: `Unknown permission "${p}".` };
  }
  return { ok: true, permissions: unique as PermissionKey[] };
}

/** The permissions in `wanted` that the actor does not hold: nobody can hand out more than they have. */
export function notGrantable(holds: (perm: string) => boolean, wanted: readonly string[]): string[] {
  return wanted.filter((p) => !holds(p));
}

export const isStandardRoleName = (name: string) => Object.hasOwn(STANDARD_ROLES, name);

