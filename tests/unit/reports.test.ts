import { describe, expect, it } from "vitest";
import { reportScope } from "@/lib/reports";
import type { AuthzContext } from "@/lib/rbac";

const context = {
  tenantId: "school-a", permissions: new Set<string>(),
  campusPermissions: new Map([["main", new Set(["finance.read"])]]),
  campusIds: ["main"], hasOrgScope: false, isPlatformStaff: false, isSuspended: false,
} as AuthzContext;
describe("report authorization", () => {
  it("limits all-campus reports to the permission's campus scope", () => {
    expect(reportScope(context, "finance")).toEqual({ tenantId: "school-a", campusId: { in: ["main"] } });
  });
  it("rejects requested campuses outside scope", () => {
    expect(() => reportScope(context, "finance", "east")).toThrow("denied");
  });
  it("does not grant payroll access from finance access", () => {
    expect(() => reportScope(context, "payroll")).toThrow("denied");
  });
  it("requires a tenant even with wildcard access", () => {
    expect(() => reportScope({ ...context, tenantId: null, permissions: new Set(["*"]) }, "finance")).toThrow("organization");
  });
});
