import { describe, it, expect } from "vitest";
import { can, canForCampus, campusScopeFor, resolveAuthz, type AuthzContext } from "@/lib/rbac";
import type { SessionUser } from "@/lib/auth";

// rbac.ts imports "server-only" — this file's mere ability to run at all
// (see vitest.config.mts's alias) is itself a regression guard for that
// setup, not just for the logic below.

const MAIN = "campus-main";
const EAST = "campus-east";

function fakeUser(
  assignments: { scopeType: "PLATFORM" | "ORG" | "CAMPUS"; campusId?: string; permissions: string[] }[],
  overrides: Partial<SessionUser> = {},
): SessionUser {
  return {
    id: "u1",
    tenantId: "t1",
    personId: null,
    email: "u1@example.com",
    displayName: "Test User",
    status: "ACTIVE",
    isPlatformStaff: false,
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    tenant: { id: "t1", status: "ACTIVE" } as SessionUser["tenant"],
    person: null,
    impersonatedByUserId: null,
    roleAssignments: assignments.map((a, i) => ({
      id: `ra${i}`,
      userId: "u1",
      roleId: `r${i}`,
      scopeType: a.scopeType,
      campusId: a.campusId ?? null,
      createdAt: new Date(),
      role: {
        id: `r${i}`,
        tenantId: "t1",
        name: `Role ${i}`,
        description: null,
        permissions: a.permissions,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      campus: a.campusId ? ({ id: a.campusId } as SessionUser["roleAssignments"][number]["campus"]) : null,
    })) as unknown as SessionUser["roleAssignments"],
    ...overrides,
  } as SessionUser;
}

function ctxFor(user: SessionUser): AuthzContext {
  return resolveAuthz(user);
}

describe("can / canForCampus — org-wide and campus-scoped grants", () => {
  it("org-wide grant satisfies any campus", () => {
    const ctx = ctxFor(fakeUser([{ scopeType: "ORG", permissions: ["student.read"] }]));
    expect(can(ctx, "student.read")).toBe(true);
    expect(canForCampus(ctx, "student.read", MAIN)).toBe(true);
    expect(canForCampus(ctx, "student.read", EAST)).toBe(true);
  });

  it("campus-scoped grant only satisfies that campus", () => {
    const ctx = ctxFor(
      fakeUser([{ scopeType: "CAMPUS", campusId: MAIN, permissions: ["student.read"] }]),
    );
    expect(can(ctx, "student.read")).toBe(false); // not org-wide
    expect(canForCampus(ctx, "student.read", MAIN)).toBe(true);
    expect(canForCampus(ctx, "student.read", EAST)).toBe(false);
  });

  it("a user can hold different roles on different campuses simultaneously (IAM-005)", () => {
    const ctx = ctxFor(
      fakeUser([
        { scopeType: "CAMPUS", campusId: MAIN, permissions: ["student.write"] },
        { scopeType: "CAMPUS", campusId: EAST, permissions: ["attendance.write"] },
      ]),
    );
    expect(canForCampus(ctx, "student.write", MAIN)).toBe(true);
    expect(canForCampus(ctx, "student.write", EAST)).toBe(false);
    expect(canForCampus(ctx, "attendance.write", EAST)).toBe(true);
    expect(canForCampus(ctx, "attendance.write", MAIN)).toBe(false);
  });

  it("wildcard '*' grants every permission, org-wide", () => {
    const ctx = ctxFor(fakeUser([{ scopeType: "ORG", permissions: ["*"] }]));
    expect(can(ctx, "fee.adjust")).toBe(true);
    expect(can(ctx, "platform.manage")).toBe(false);
    expect(campusScopeFor(ctx, "platform.manage")).toEqual([]);
  });

  it("wildcard scoped to a single campus only grants on that campus", () => {
    const ctx = ctxFor(fakeUser([{ scopeType: "CAMPUS", campusId: MAIN, permissions: ["*"] }]));
    expect(canForCampus(ctx, "fee.adjust", MAIN)).toBe(true);
    expect(canForCampus(ctx, "fee.adjust", EAST)).toBe(false);
  });

  it("no assignments means no permissions anywhere", () => {
    const ctx = ctxFor(fakeUser([]));
    expect(can(ctx, "student.read")).toBe(false);
    expect(canForCampus(ctx, "student.read", MAIN)).toBe(false);
  });
});

describe("campusScopeFor", () => {
  it("returns null (meaning 'all campuses') for an org-wide grant", () => {
    const ctx = ctxFor(fakeUser([{ scopeType: "ORG", permissions: ["student.read"] }]));
    expect(campusScopeFor(ctx, "student.read")).toBeNull();
  });

  it("returns exactly the campuses granting the permission", () => {
    const ctx = ctxFor(
      fakeUser([
        { scopeType: "CAMPUS", campusId: MAIN, permissions: ["student.read"] },
        { scopeType: "CAMPUS", campusId: EAST, permissions: ["fee.read"] },
      ]),
    );
    expect(campusScopeFor(ctx, "student.read")).toEqual([MAIN]);
  });

  it("returns an empty array when the permission is held nowhere", () => {
    const ctx = ctxFor(fakeUser([{ scopeType: "CAMPUS", campusId: MAIN, permissions: ["student.read"] }]));
    expect(campusScopeFor(ctx, "fee.adjust")).toEqual([]);
  });
});

describe("TEN-005 — suspension blocks non-exempt permissions everywhere", () => {
  function suspendedCtx(permissions: string[]): AuthzContext {
    const user = fakeUser([{ scopeType: "ORG", permissions }], {
      tenant: { id: "t1", status: "SUSPENDED" } as SessionUser["tenant"],
    });
    return ctxFor(user);
  }

  it("blocks an ordinary permission even though the role grants it", () => {
    const ctx = suspendedCtx(["student.read"]);
    expect(ctx.isSuspended).toBe(true);
    expect(can(ctx, "student.read")).toBe(false);
    expect(canForCampus(ctx, "student.read", MAIN)).toBe(false);
    expect(campusScopeFor(ctx, "student.read")).toEqual([]);
  });

  it("blocks even a wildcard role for non-exempt permissions", () => {
    const ctx = suspendedCtx(["*"]);
    expect(can(ctx, "student.write")).toBe(false);
  });

  it("still allows the exempt billing/audit permissions", () => {
    const ctx = suspendedCtx(["*"]);
    expect(can(ctx, "billing.read")).toBe(true);
    expect(can(ctx, "billing.manage")).toBe(true);
    expect(can(ctx, "audit.read")).toBe(true);
  });

  it("does not apply to platform staff (no tenant to suspend)", () => {
    const user = fakeUser([{ scopeType: "PLATFORM", permissions: ["*"] }], {
      isPlatformStaff: true,
      tenant: { id: "t1", status: "SUSPENDED" } as SessionUser["tenant"],
    });
    const ctx = ctxFor(user);
    expect(ctx.isSuspended).toBe(false);
    expect(can(ctx, "student.read")).toBe(true);
  });

  it("a non-suspended tenant is unaffected", () => {
    const ctx = ctxFor(fakeUser([{ scopeType: "ORG", permissions: ["student.read"] }]));
    expect(ctx.isSuspended).toBe(false);
    expect(can(ctx, "student.read")).toBe(true);
  });
});
