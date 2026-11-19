import { describe, it, expect, afterAll } from "vitest";
import { ProvisionError, provisionSchool } from "@/lib/provision";
import { prisma, makeTenant, makeUser, cleanupAll, uid } from "./helpers";
import { resolveAuthz } from "@/lib/rbac";

// TEN-004: provisioning must leave a school that is usable and isolated.
describe("school provisioning", () => {
  let planId: string;
  const slug = uid("slug").replace(/_/g, "-").toLowerCase();
  const email = `${uid("admin")}@example.test`;

  afterAll(async () => {
    await cleanupAll();
    await prisma.plan.deleteMany({ where: { code: { startsWith: "itest_" } } });
  });

  it("creates a usable school: roles, owner, subscription, defaults, invite", async () => {
    planId = (await prisma.plan.create({ data: { code: uid("plan"), name: "ITest plan", priceMonthly: 0 } })).id;
    const r = await provisionSchool({ name: "ITest School", slug, planId, adminEmail: email, adminName: "Ada Admin" });
    expect(r.created).toBe(true);

    const roles = await prisma.role.findMany({ where: { tenantId: r.tenantId }, select: { name: true } });
    expect(roles.map((x) => x.name).sort()).toEqual(
      ["Admissions Officer", "Campus Administrator", "Finance Officer", "Organization Owner", "Parent / Guardian", "Teacher"],
    );

    const admin = await prisma.user.findUniqueOrThrow({
      where: { id: r.adminUserId },
      include: { tenant: true, person: true, roleAssignments: { include: { role: true, campus: true } } },
    });
    expect(admin.passwordResetToken).toBe(r.inviteToken);
    expect(admin.passwordResetTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
    // The admin really holds organization-wide rights.
    const ctx = resolveAuthz({ ...admin, impersonatedByUserId: null } as Parameters<typeof resolveAuthz>[0]);
    expect(ctx.hasOrgScope).toBe(true);
    expect(ctx.permissions.has("student.write") || ctx.permissions.has("*")).toBe(true);

    expect(await prisma.subscription.count({ where: { tenantId: r.tenantId, planId, status: "TRIAL" } })).toBe(1);
    expect(await prisma.attendanceCode.count({ where: { tenantId: r.tenantId } })).toBe(4);
    const scale = await prisma.gradeScale.findFirstOrThrow({ where: { tenantId: r.tenantId }, include: { bands: true } });
    expect(scale.bands.some((b) => b.minPercent === 0 && !b.isPass)).toBe(true);
    expect(await prisma.leaveType.count({ where: { tenantId: r.tenantId, appliesTo: "STAFF" } })).toBe(2);
    // parents can report an absence from day one
    expect(await prisma.leaveType.count({ where: { tenantId: r.tenantId, appliesTo: "STUDENT" } })).toBe(2);
  });

  it("is idempotent: running again does not duplicate anything", async () => {
    const again = await provisionSchool({ name: "ITest School Renamed", slug, planId, adminEmail: email });
    expect(again.created).toBe(false);
    const t = await prisma.tenant.findUniqueOrThrow({ where: { slug } });
    expect(t.name).toBe("ITest School Renamed");
    expect(await prisma.campus.count({ where: { tenantId: t.id } })).toBe(1);
    expect(await prisma.role.count({ where: { tenantId: t.id } })).toBe(6);
    expect(await prisma.subscription.count({ where: { tenantId: t.id } })).toBe(1);
    expect(await prisma.attendanceCode.count({ where: { tenantId: t.id } })).toBe(4);
    expect(await prisma.roleAssignment.count({ where: { userId: again.adminUserId } })).toBe(1);
  });

  it("refuses an email that belongs to another school, and bad input", async () => {
    const other = await makeTenant("Someone Else");
    const foreign = await makeUser({ tenantId: other.id, permissions: [], scope: "ORG" });
    const foreignEmail = (await prisma.user.findUniqueOrThrow({ where: { id: foreign.id } })).email;
    const newSlug = uid("slug2").replace(/_/g, "-").toLowerCase();
    await expect(provisionSchool({ name: "X", slug: newSlug, planId, adminEmail: foreignEmail })).rejects.toBeInstanceOf(ProvisionError);
    expect(await prisma.tenant.findUnique({ where: { slug: newSlug } })).toBeNull();
    // The foreign user must not have been granted anything.
    expect(await prisma.roleAssignment.count({ where: { userId: foreign.id, role: { name: "Organization Owner" } } })).toBe(0);

    await expect(provisionSchool({ name: "X", slug: "Bad Slug!", planId, adminEmail: "a@b.co" })).rejects.toBeInstanceOf(ProvisionError);
    await expect(provisionSchool({ name: "X", slug: "ok-slug", planId: "nope", adminEmail: "a@b.co" })).rejects.toBeInstanceOf(ProvisionError);
  });
});
