import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { familyLinks, familyAccess } from "@/lib/family";
import { requestStudentLeave, cancelStudentLeave } from "@/app/portal/family/actions";
import { decideStudentLeave } from "@/app/portal/attendance/leave-actions";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const ymd = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("family portal access and student leave", () => {
  let tenantId: string, campusId: string, otherCampus: string;
  let child1: string, child2: string, strangerChild: string, childPerson: string;
  let payer: unknown, readerGuardian: unknown, otherParent: unknown, studentSelf: unknown, teacher: unknown, otherTeacher: unknown, plainStaff: unknown;
  let payerUserId: string, readerUserId: string, teacherUserId: string, otherTeacherUserId: string, leaveTypeId: string, staffOnlyTypeId: string;

  const guardianUser = async (links: { studentId: string; payer?: boolean; primary?: boolean }[]) => {
    const u = await makeUser({ tenantId, permissions: [], scope: "ORG" });
    const person = await prisma.person.create({ data: { tenantId, firstName: "Parent", lastName: uid("g") } });
    await prisma.user.update({ where: { id: u.id }, data: { personId: person.id } });
    const g = await prisma.guardian.create({ data: { tenantId, personId: person.id } });
    for (const l of links) await prisma.guardianRelationship.create({ data: { tenantId, guardianId: g.id, studentId: l.studentId, financiallyResponsible: !!l.payer, isPrimaryContact: !!l.primary } });
    return { ctx: await authContextFor(u.id), userId: u.id };
  };

  beforeAll(async () => {
    tenantId = (await makeTenant("Family Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    const s1 = await makeStudent({ tenantId, campusId, firstName: "Kid", lastName: "One", admissionNumber: uid("A") });
    const s2 = await makeStudent({ tenantId, campusId, firstName: "Kid", lastName: "Two", admissionNumber: uid("B") });
    const s3 = await makeStudent({ tenantId, campusId: otherCampus, firstName: "Not", lastName: "Mine", admissionNumber: uid("C") });
    child1 = s1.id; child2 = s2.id; strangerChild = s3.id;
    childPerson = (await prisma.student.findUniqueOrThrow({ where: { id: child1 } })).personId;

    const p = await guardianUser([{ studentId: child1, payer: true }, { studentId: child2, primary: true }]);
    payer = p.ctx; payerUserId = p.userId;
    const r = await guardianUser([{ studentId: child1 }]); // linked, not paying, not primary
    readerGuardian = r.ctx; readerUserId = r.userId;
    otherParent = (await guardianUser([{ studentId: strangerChild, payer: true }])).ctx;

    // a student who has their own login
    const su = await makeUser({ tenantId, permissions: [], scope: "ORG" });
    await prisma.user.update({ where: { id: su.id }, data: { personId: childPerson } });
    studentSelf = await authContextFor(su.id);

    const t1 = await makeUser({ tenantId, permissions: ["attendance.leave.approve"], scope: "CAMPUS", campusId });
    const t2 = await makeUser({ tenantId, permissions: ["attendance.leave.approve"], scope: "CAMPUS", campusId: otherCampus });
    teacherUserId = t1.id; otherTeacherUserId = t2.id;
    teacher = await authContextFor(t1.id);
    otherTeacher = await authContextFor(t2.id);
    plainStaff = await authContextFor((await makeUser({ tenantId, permissions: ["student.read"], scope: "CAMPUS", campusId })).id);
    leaveTypeId = (await prisma.leaveType.create({ data: { tenantId, name: "Sick day", appliesTo: "STUDENT" } })).id;
    staffOnlyTypeId = (await prisma.leaveType.create({ data: { tenantId, name: "Annual", appliesTo: "STAFF" } })).id;
  });
  afterAll(cleanupAll);

  it("links guardians to their own children, a student to themselves, and nobody else", async () => {
    expect((await familyLinks(payer as never)).map((l) => l.studentId).sort()).toEqual([child1, child2].sort());
    expect((await familyLinks(readerGuardian as never)).map((l) => l.studentId)).toEqual([child1]);
    expect(await familyAccess(payer as never, strangerChild)).toBeNull();
    expect(await familyAccess(otherParent as never, child1)).toBeNull();
    const self = await familyLinks(studentSelf as never);
    expect(self).toEqual([{ studentId: child1, relation: "self", canSeeFees: false }]);
    // staff, even with student.read, are not family
    expect(await familyLinks(plainStaff as never)).toEqual([]);
  });

  it("shows fees only to the paying or primary guardian, never to the student or a plain guardian", async () => {
    expect((await familyAccess(payer as never, child1))!.canSeeFees).toBe(true); // paying
    expect((await familyAccess(payer as never, child2))!.canSeeFees).toBe(true); // primary
    expect((await familyAccess(readerGuardian as never, child1))!.canSeeFees).toBe(false);
    expect((await familyAccess(studentSelf as never, child1))!.canSeeFees).toBe(false);
  });

  const ask = (o: Record<string, string> = {}) => requestStudentLeave({}, fd({ studentId: child1, leaveTypeId, startDate: ymd(1), endDate: ymd(2), reason: "Doctor's appointment", ...o }));

  it("lets only a linked guardian request leave, with checks on type, dates and overlaps", async () => {
    current = otherParent;
    expect((await ask()).error).toMatch(/only a parent/i);
    current = studentSelf;
    expect((await ask()).error).toMatch(/only a parent/i);
    current = payer;
    expect((await ask({ leaveTypeId: staffOnlyTypeId })).error).toMatch(/leave type/i);
    expect((await ask({ endDate: ymd(0) })).error).toMatch(/before the start/i);
    expect((await ask({ startDate: ymd(-30), endDate: ymd(-29) })).error).toMatch(/week in the past/i);
    expect((await ask({ startDate: ymd(1), endDate: ymd(200) })).error).toMatch(/limited to 60/i);
    expect((await ask({ reason: "" })).error).toMatch(/why/i);
    expect((await ask({ startDate: "garbage" })).error).toMatch(/both dates/i);
    expect(await prisma.leaveRequest.count({ where: { tenantId } })).toBe(0);
    expect((await ask()).ok).toBe(true);
    expect((await ask({ startDate: ymd(2), endDate: ymd(3) })).error).toMatch(/already a pending/i);
  });

  it("tells approvers about the request but not people who cannot decide it", async () => {
    const req = await prisma.leaveRequest.findFirstOrThrow({ where: { tenantId } });
    expect(req).toMatchObject({ campusId, personId: childPerson, status: "PENDING", staffId: null });
    const notified = (await prisma.message.findMany({ where: { tenantId, relatedId: req.id } })).map((m) => m.recipientUserId);
    expect(notified).toEqual([teacherUserId]); // the approver on this campus only
    expect(notified).not.toContain(otherTeacherUserId);
    expect(notified).not.toContain(payerUserId);
  });

  it("decides on the campus only, needs a reason to decline, and tells the family", async () => {
    const req = await prisma.leaveRequest.findFirstOrThrow({ where: { tenantId } });
    current = plainStaff;
    expect((await decideStudentLeave({}, fd({ requestId: req.id, decision: "APPROVED" }))).error).toMatch(/permission/i);
    current = otherTeacher;
    expect((await decideStudentLeave({}, fd({ requestId: req.id, decision: "APPROVED" }))).error).toMatch(/permission/i);
    current = teacher;
    expect((await decideStudentLeave({}, fd({ requestId: req.id, decision: "REJECTED" }))).error).toMatch(/why/i);
    expect((await decideStudentLeave({}, fd({ requestId: req.id, decision: "MAYBE" }))).error).toMatch(/approve or reject/i);
    expect((await decideStudentLeave({}, fd({ requestId: req.id, decision: "APPROVED" }))).ok).toBe(true);
    expect((await decideStudentLeave({}, fd({ requestId: req.id, decision: "REJECTED", note: "too late" }))).error).toMatch(/already decided/i);
    const told = await prisma.message.findMany({ where: { tenantId, title: "Leave approved" } });
    expect(told.map((m) => m.recipientUserId).sort()).toEqual([payerUserId, readerUserId].sort());
    // a decided request cannot be cancelled by the family
    current = payer;
    expect((await cancelStudentLeave({}, fd({ requestId: req.id }))).error).toMatch(/only a pending/i);
  });

  it("lets a guardian cancel a pending request but not someone else's", async () => {
    current = payer;
    expect((await ask({ startDate: ymd(10), endDate: ymd(11) })).ok).toBe(true);
    const pending = await prisma.leaveRequest.findFirstOrThrow({ where: { tenantId, status: "PENDING" } });
    current = otherParent;
    expect((await cancelStudentLeave({}, fd({ requestId: pending.id }))).error).toMatch(/not found/i);
    current = payer;
    expect((await cancelStudentLeave({}, fd({ requestId: pending.id }))).ok).toBe(true);
    expect((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("CANCELLED");
  });
});
