import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  prisma,
  makeTenant,
  makeCampus,
  makeStudent,
  cleanupAll,
} from "./helpers";

// TEN-001 / TEN-002 — tenant-owned data is isolated at the query level.
// Two independent tenants are built with a student each; every read scoped to
// one tenant's id must never surface the other's rows.

describe("cross-tenant data isolation (TEN-001/002)", () => {
  let tenantA: string;
  let tenantB: string;
  let campusA: string;
  let campusB: string;
  let studentA: string;
  let studentB: string;

  beforeAll(async () => {
    const a = await makeTenant("Tenant A");
    const b = await makeTenant("Tenant B");
    tenantA = a.id;
    tenantB = b.id;
    campusA = (await makeCampus(tenantA)).id;
    campusB = (await makeCampus(tenantB)).id;
    studentA = (
      await makeStudent({
        tenantId: tenantA,
        campusId: campusA,
        firstName: "Alice",
        lastName: "Anderson",
        admissionNumber: "A-0001",
      })
    ).id;
    studentB = (
      await makeStudent({
        tenantId: tenantB,
        campusId: campusB,
        firstName: "Bob",
        lastName: "Baker",
        admissionNumber: "B-0001",
      })
    ).id;
  });

  afterAll(async () => {
    await cleanupAll();
  });

  it("student list scoped to tenant A excludes tenant B", async () => {
    const rows = await prisma.student.findMany({ where: { tenantId: tenantA } });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(studentA);
    expect(ids).not.toContain(studentB);
  });

  it("fetching tenant B's student by id under tenant A's scope returns null", async () => {
    const leaked = await prisma.student.findFirst({
      where: { id: studentB, tenantId: tenantA },
    });
    expect(leaked).toBeNull();
  });

  it("name search is empty across the tenant boundary", async () => {
    const hits = await prisma.student.findMany({
      where: {
        tenantId: tenantA,
        person: { lastName: { contains: "Baker", mode: "insensitive" } },
      },
    });
    expect(hits).toHaveLength(0);
  });

  it("enrollments, people and campuses are all tenant-scoped", async () => {
    const [enr, ppl, camp] = await Promise.all([
      prisma.enrollment.findMany({ where: { tenantId: tenantA } }),
      prisma.person.findMany({ where: { tenantId: tenantA } }),
      prisma.campus.findMany({ where: { tenantId: tenantA } }),
    ]);
    expect(enr.every((e) => e.campusId === campusA)).toBe(true);
    expect(ppl.every((p) => p.lastName !== "Baker")).toBe(true);
    expect(camp.map((c) => c.id)).toEqual([campusA]);
  });

  it("a cross-tenant update touches nothing", async () => {
    const res = await prisma.student.updateMany({
      where: { id: studentB, tenantId: tenantA },
      data: { status: "WITHDRAWN" },
    });
    expect(res.count).toBe(0);
    const still = await prisma.student.findUnique({ where: { id: studentB } });
    expect(still?.status).toBe("ENROLLED");
  });
});
