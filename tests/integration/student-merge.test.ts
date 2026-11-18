import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MergeError, mergeStudents, previewStudentMerge } from "@/lib/student-merge";
import { prisma, makeTenant, makeCampus, makeStudent, makeUser, cleanupAll, uid } from "./helpers";

// ADM-006: the merge deletes a student row (which cascades), so these tests
// pin the guards and prove nothing attached to the duplicate is lost.

describe("student record merge", () => {
  let tenantId: string;
  let otherTenantStudent: string;
  let campusId: string;
  let actorId: string;
  let keepId: string;
  let dupId: string;
  let dupPersonId: string;
  let guardianId: string;

  beforeAll(async () => {
    tenantId = (await makeTenant("Merge Org")).id;
    campusId = (await makeCampus(tenantId)).id;
    actorId = (await makeUser({ tenantId, permissions: ["student.merge"], scope: "ORG" })).id;

    const keep = await makeStudent({ tenantId, campusId, firstName: "Ana", lastName: "Keep", admissionNumber: uid("K") });
    const dup = await makeStudent({ tenantId, campusId, firstName: "Ana", lastName: "Keep", admissionNumber: uid("D") });
    keepId = keep.id;
    dupId = dup.id;
    dupPersonId = dup.personId;

    // The same guardian linked to both records: a unique-key clash.
    const gPerson = await prisma.person.create({ data: { tenantId, firstName: "Gia", lastName: "Guardian" } });
    guardianId = (await prisma.guardian.create({ data: { tenantId, personId: gPerson.id } })).id;
    for (const studentId of [keepId, dupId])
      await prisma.guardianRelationship.create({ data: { tenantId, guardianId, studentId } });

    await prisma.payment.create({ data: { tenantId, campusId, studentId: keepId, number: uid("P"), amount: 100 } });
    await prisma.payment.create({ data: { tenantId, campusId, studentId: dupId, number: uid("P"), amount: 250 } });
    await prisma.invoice.create({
      data: { tenantId, campusId, studentId: dupId, number: uid("I"), periodLabel: "T1", dueDate: new Date(), total: 500, balance: 250 },
    });

    const otherTenant = (await makeTenant("Other Org")).id;
    const otherCampus = (await makeCampus(otherTenant)).id;
    otherTenantStudent = (
      await makeStudent({ tenantId: otherTenant, campusId: otherCampus, firstName: "Out", lastName: "Sider", admissionNumber: uid("O") })
    ).id;
  });

  afterAll(cleanupAll);

  it("refuses to merge a record into itself or across tenants", async () => {
    await expect(mergeStudents(tenantId, keepId, keepId, actorId, "r")).rejects.toBeInstanceOf(MergeError);
    await expect(mergeStudents(tenantId, keepId, otherTenantStudent, actorId, "r")).rejects.toBeInstanceOf(MergeError);
    // Nothing was touched.
    expect(await prisma.student.findUnique({ where: { id: otherTenantStudent } })).not.toBeNull();
  });

  it("blocks while both records have an active enrollment", async () => {
    const preview = await previewStudentMerge(tenantId, keepId, dupId);
    expect(preview.blockers.join(" ")).toMatch(/active enrollment/i);
    await expect(mergeStudents(tenantId, keepId, dupId, actorId, "r")).rejects.toBeInstanceOf(MergeError);
    expect(await prisma.student.findUnique({ where: { id: dupId } })).not.toBeNull();
    expect(await prisma.payment.count({ where: { studentId: dupId } })).toBe(1);
  });

  it("blocks when both records have a health record, never discarding health data", async () => {
    await prisma.enrollment.updateMany({ where: { studentId: dupId }, data: { status: "WITHDRAWN" } });
    for (const studentId of [keepId, dupId]) await prisma.healthRecord.create({ data: { tenantId, campusId, studentId } });

    const preview = await previewStudentMerge(tenantId, keepId, dupId);
    expect(preview.blockers.join(" ")).toMatch(/health record/i);
    await expect(mergeStudents(tenantId, keepId, dupId, actorId, "r")).rejects.toBeInstanceOf(MergeError);

    await prisma.healthRecord.delete({ where: { studentId: dupId } });
  });

  it("moves everything to the kept record, de-duplicates clashes, soft-deletes the person and audits", async () => {
    const preview = await previewStudentMerge(tenantId, keepId, dupId);
    expect(preview.blockers).toEqual([]);
    const moving = Object.fromEntries(preview.moving.map((m) => [m.label, m.count]));
    expect(moving).toMatchObject({ Enrollments: 1, "Guardian links": 1, Payments: 1, Invoices: 1 });

    await mergeStudents(tenantId, keepId, dupId, actorId, "Duplicate entered at intake");

    expect(await prisma.student.findUnique({ where: { id: dupId } })).toBeNull();
    expect((await prisma.person.findUniqueOrThrow({ where: { id: dupPersonId } })).deletedAt).not.toBeNull();

    expect(await prisma.payment.count({ where: { studentId: keepId } })).toBe(2);
    expect(await prisma.invoice.count({ where: { studentId: keepId } })).toBe(1);
    expect(await prisma.enrollment.count({ where: { studentId: keepId } })).toBe(2);
    // The clashing guardian link collapsed to one; the keeper's row won.
    expect(await prisma.guardianRelationship.count({ where: { studentId: keepId, guardianId } })).toBe(1);
    // The keeper's own health record is untouched.
    expect(await prisma.healthRecord.count({ where: { studentId: keepId } })).toBe(1);

    const event = await prisma.auditEvent.findFirstOrThrow({ where: { chainKey: tenantId, action: "student.merge" } });
    expect(event.actorUserId).toBe(actorId);
    expect(event.metadata).toMatchObject({ reason: "Duplicate entered at intake", discardedDuplicates: 1 });
  });
});
