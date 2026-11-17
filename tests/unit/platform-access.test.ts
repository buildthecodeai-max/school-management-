import { describe, it, expect, vi } from "vitest";
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { tenant: { findUnique: vi.fn() }, campus: { findFirst: vi.fn() } } }));
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireUser, can, canForCampus, campusScopeFor, assertPermission } from "@/lib/rbac";

async function context(staff: boolean, campus = "main", valid = true) {
  vi.mocked(getSessionUser).mockResolvedValue({ id: "operator", tenantId: staff ? null : "school", tenant: null, isPlatformStaff: staff, roleAssignments: [{ scopeType: "ORG", role: { permissions: ["*"] } }], impersonatedByUserId: null } as never);
  vi.mocked(cookies).mockResolvedValue({ get: (key: string) => ({ value: key === "sms_operator_tenant" ? "school" : campus }) } as never);
  vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ id: "school", name: "School" } as never);
  vi.mocked(prisma.campus.findFirst).mockResolvedValue(valid ? { id: "main", tenantId: "school" } as never : null);
  return requireUser();
}

describe("platform school context", () => {
  it("keeps the operator identity while restricting campus operations", async () => {
    const ctx = await context(true);
    expect(ctx.user.id).toBe("operator");
    expect(ctx.tenantId).toBe("school");
    expect(campusScopeFor(ctx, "student.read")).toEqual(["main"]);
    expect(canForCampus(ctx, "student.write", "main")).toBe(true);
    expect(canForCampus(ctx, "student.write", "other")).toBe(false);
    expect(can(ctx, "platform.manage")).toBe(true);
  });
  it("supports organization-wide operator access", async () => {
    expect(campusScopeFor(await context(true, ""), "student.read")).toBeNull();
  });
  it("rejects a campus outside the chosen organization", async () => {
    expect((await context(true, "foreign", false)).tenantId).toBeNull();
  });
  it("does not grant platform authority through a tenant wildcard or cookie", async () => {
    const ctx = await context(false);
    expect(ctx.operatorCampusId).toBeUndefined();
    expect(() => assertPermission(ctx, "platform.manage")).toThrow();
    expect(canForCampus(ctx, "platform.manage", "main")).toBe(false);
  });
});
