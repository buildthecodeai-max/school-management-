import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { assignFeeToStudent, bulkAssignFeeToSection, removeFeeAssignment } from "@/app/portal/fees/assignment-actions";
import { resolveBillingPreview } from "@/lib/finance-server";
import { prisma, makeTenant, makeCampus, makeStudent, makeUser, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

// Discounts change what families are billed, so rights, scope and the effect on
// billing are pinned here.
describe("fee assignment and discounts", () => {
  let tenantId: string, campusId: string, otherCampus: string, structureId: string, otherStructureId: string;
  let studentA: { id: string; admissionNumber: string }, studentB: { id: string; admissionNumber: string };
  let sectionId: string;
  let adjuster: unknown, clerk: unknown;

  beforeAll(async () => {
    tenantId = (await makeTenant("Fees Org")).id;
    campusId = (await makeCampus(tenantId, "Main")).id;
    otherCampus = (await makeCampus(tenantId, "Other")).id;
    studentA = await makeStudent({ tenantId, campusId, firstName: "Ann", lastName: "One", admissionNumber: uid("A") });
    studentB = await makeStudent({ tenantId, campusId, firstName: "Ben", lastName: "Two", admissionNumber: uid("B") });
    sectionId = (await prisma.enrollment.findFirstOrThrow({ where: { studentId: studentA.id } })).sectionId;
    // put B in A's section so a section bulk covers both
    await prisma.enrollment.updateMany({ where: { studentId: studentB.id }, data: { sectionId } });
    const head = await prisma.feeHead.create({ data: { tenantId, code: uid("T"), name: "Tuition" } });
    const mk = async (cId: string, name: string) => {
      const s = await prisma.feeStructure.create({ data: { tenantId, campusId: cId, name } });
      await prisma.feeStructureLine.create({ data: { tenantId, structureId: s.id, feeHeadId: head.id, amount: 100_000 } });
      return s.id;
    };
    structureId = await mk(campusId, "Term fees");
    otherStructureId = await mk(otherCampus, "Other fees");
    adjuster = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read", "fee.adjust"], scope: "ORG" })).id);
    clerk = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read", "fee.bill"], scope: "ORG" })).id);
  });
  afterAll(cleanupAll);

  it("only someone with fee.adjust may assign or discount", async () => {
    current = clerk;
    const r = await assignFeeToStudent({}, fd({ admissionNumber: studentA.admissionNumber, feeStructureId: structureId, discountPct: "10", discountReason: "x" }));
    expect(r.error).toMatch(/permission/i);
    expect(await prisma.studentFeeAssignment.count({ where: { tenantId } })).toBe(0);
  });

  it("validates the discount and the campus", async () => {
    current = adjuster;
    const a = (o: Record<string, string>) => assignFeeToStudent({}, fd({ admissionNumber: studentA.admissionNumber, feeStructureId: structureId, ...o }));
    expect((await a({ discountPct: "150" })).error).toMatch(/0 to 100/);
    expect((await a({ discountPct: "12.5" })).error).toMatch(/whole number/);
    expect((await a({ discountPct: "10" })).error).toMatch(/reason/i);
    expect((await assignFeeToStudent({}, fd({ admissionNumber: "nope", feeStructureId: structureId }))).error).toMatch(/no student/i);
    expect((await assignFeeToStudent({}, fd({ admissionNumber: studentA.admissionNumber, feeStructureId: otherStructureId }))).error).toMatch(/not actively enrolled/i);
  });

  it("assigns with a discount, which billing then applies; re-assigning updates rather than duplicates", async () => {
    current = adjuster;
    expect((await assignFeeToStudent({}, fd({ admissionNumber: studentA.admissionNumber, feeStructureId: structureId, discountPct: "25", discountReason: "Sibling" }))).ok).toBe(true);
    let preview = await resolveBillingPreview(tenantId, structureId, "Term 1");
    expect(preview!.rows.find((r) => r.studentId === studentA.id)).toMatchObject({ discountPct: 25, total: 75_000 });
    expect(preview!.rows.find((r) => r.studentId === studentB.id)).toMatchObject({ discountPct: 0, total: 100_000 });

    await assignFeeToStudent({}, fd({ admissionNumber: studentA.admissionNumber, feeStructureId: structureId, discountPct: "50", discountReason: "Scholarship" }));
    expect(await prisma.studentFeeAssignment.count({ where: { studentId: studentA.id } })).toBe(1);
    preview = await resolveBillingPreview(tenantId, structureId, "Term 1");
    expect(preview!.rows.find((r) => r.studentId === studentA.id)!.total).toBe(50_000);
  });

  it("bulk: preview changes nothing, commit assigns only those not already assigned", async () => {
    current = adjuster;
    const bulk = (mode: string) => bulkAssignFeeToSection({}, fd({ feeStructureId: structureId, sectionId, discountPct: "0", mode }));
    const before = await prisma.studentFeeAssignment.count({ where: { tenantId } });
    const p = await bulk("preview");
    expect(p.message).toMatch(/1 student\(s\) would be assigned.*1 already assigned/);
    expect(await prisma.studentFeeAssignment.count({ where: { tenantId } })).toBe(before);
    expect((await bulk("commit")).message).toMatch(/Assigned 1/);
    expect(await prisma.studentFeeAssignment.count({ where: { tenantId } })).toBe(before + 1);
    // A's existing 50% discount was not overwritten by the bulk run.
    expect((await prisma.studentFeeAssignment.findFirstOrThrow({ where: { studentId: studentA.id } })).discountPct).toBe(50);
    expect((await bulk("commit")).message).toMatch(/Assigned 0/);
  });

  it("removal needs the right, is audited, and leaves billing at full price", async () => {
    const row = await prisma.studentFeeAssignment.findFirstOrThrow({ where: { studentId: studentA.id } });
    current = clerk;
    expect((await removeFeeAssignment({}, fd({ id: row.id }))).error).toMatch(/permission/i);
    current = adjuster;
    expect((await removeFeeAssignment({}, fd({ id: row.id }))).ok).toBe(true);
    const preview = await resolveBillingPreview(tenantId, structureId, "Term 1");
    expect(preview!.rows.find((r) => r.studentId === studentA.id)!.total).toBe(100_000);
    expect(await prisma.auditEvent.count({ where: { chainKey: tenantId, action: { startsWith: "fee.assignment" } } })).toBeGreaterThanOrEqual(4);
  });
});
