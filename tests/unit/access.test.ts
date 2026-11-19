import { describe, it, expect } from "vitest";
import { effectiveAccess, hasOn, validateRolePermissions, notGrantable, isStandardRoleName, ALL_SCHOOL_PERMISSIONS } from "@/lib/access";

describe("access rules", () => {
  const access = effectiveAccess([
    { scopeType: "ORG", campusId: null, permissions: ["student.read"] },
    { scopeType: "CAMPUS", campusId: "A", permissions: ["fee.read", "fee.collect"] },
    { scopeType: "CAMPUS", campusId: "A", permissions: ["attendance.read"] },
    { scopeType: "CAMPUS", campusId: "B", permissions: ["fee.read"] },
  ]);
  it("combines assignments into org-wide and per-campus access", () => {
    expect(hasOn(access, "student.read", "A")).toBe(true);
    expect(hasOn(access, "student.read", null)).toBe(true);
    expect(hasOn(access, "fee.collect", "A")).toBe(true);
    expect(hasOn(access, "fee.collect", "B")).toBe(false);
    expect(hasOn(access, "attendance.read", "A")).toBe(true);
    expect(hasOn(access, "fee.read", null)).toBe(false);
  });
  it("treats a wildcard role as every school permission", () => {
    const a = effectiveAccess([{ scopeType: "ORG", campusId: null, permissions: ["*"] }]);
    expect(hasOn(a, "fee.adjust", null)).toBe(true);
    expect(hasOn(a, "iam.roles.manage", null)).toBe(true);
    expect(hasOn(a, "platform.manage", null)).toBe(false);
  });
  it("keeps platform permissions and unknown keys out of school roles", () => {
    expect(validateRolePermissions(["student.read", "fee.read"])).toEqual({ ok: true, permissions: ["student.read", "fee.read"] });
    expect(validateRolePermissions(["student.read", "student.read"])).toEqual({ ok: true, permissions: ["student.read"] });
    expect(validateRolePermissions([]).ok).toBe(false);
    expect(validateRolePermissions("student.read").ok).toBe(false);
    expect(validateRolePermissions(["platform.manage"]).ok).toBe(false);
    expect(validateRolePermissions(["*"]).ok).toBe(false);
    expect(validateRolePermissions(["made.up"]).ok).toBe(false);
  });
  it("lists what an actor cannot hand out", () => {
    const holds = (p: string) => ["student.read", "fee.read"].includes(p);
    expect(notGrantable(holds, ["student.read", "fee.adjust", "iam.roles.manage"])).toEqual(["fee.adjust", "iam.roles.manage"]);
    expect(notGrantable(holds, ["fee.read"])).toEqual([]);
  });
  it("knows the standard roles and exposes only school permissions", () => {
    expect(isStandardRoleName("Teacher")).toBe(true);
    expect(isStandardRoleName("My custom role")).toBe(false);
    expect(ALL_SCHOOL_PERMISSIONS.some((p) => p.startsWith("platform."))).toBe(false);
    expect(ALL_SCHOOL_PERMISSIONS).toContain("iam.users.manage");
  });
});
