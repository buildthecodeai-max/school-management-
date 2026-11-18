import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { saveAttendance, lockAttendanceRegister } from "@/app/portal/attendance/actions";
import { attendanceReport } from "@/lib/attendance-report";
import { formatDay } from "@/lib/attendance";
import { dayStart } from "@/lib/dates";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const daysAgo = (n: number) => { const d = dayStart(); d.setDate(d.getDate() - n); return d; };

describe("attendance registers", () => {
  let tenantId: string, campusId: string, otherCampusId: string;
  let sectionId: string, s1: string, s2: string, outsider: string;
  let P: string, A: string, L: string, foreignCode: string;
  let teacher: unknown, amender: unknown, otherCampusTeacher: unknown;

  beforeAll(async () => {
    tenantId = (await makeTenant("Att Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampusId = (await makeCampus(tenantId, "B")).id;
    const st1 = await makeStudent({ tenantId, campusId, firstName: "Ann", lastName: "One", admissionNumber: uid("AD") });
    s1 = st1.id;
    const en = await prisma.enrollment.findFirstOrThrow({ where: { studentId: s1 } });
    sectionId = en.sectionId;
    const p2 = await prisma.person.create({ data: { tenantId, firstName: "Ben", lastName: "Two" } });
    const st2 = await prisma.student.create({ data: { tenantId, personId: p2.id, admissionNumber: uid("AD"), status: "ENROLLED" } });
    s2 = st2.id;
    await prisma.enrollment.create({ data: { tenantId, studentId: s2, campusId, academicYearId: en.academicYearId, gradeLevelId: en.gradeLevelId, sectionId, status: "ACTIVE" } });
    outsider = (await makeStudent({ tenantId, campusId, firstName: "Out", lastName: "Sider", admissionNumber: uid("AD") })).id;

    const mk = (code: string, category: "PRESENT" | "ABSENT" | "LATE", countsAsPresent: boolean) =>
      prisma.attendanceCode.create({ data: { tenantId, code, label: code, category, countsAsPresent } }).then((c) => c.id);
    P = await mk("P", "PRESENT", true);
    A = await mk("A", "ABSENT", false);
    L = await mk("L", "LATE", true);
    const other = (await makeTenant("Other Att Org")).id;
    foreignCode = (await prisma.attendanceCode.create({ data: { tenantId: other, code: "P", label: "P", category: "PRESENT", countsAsPresent: true } })).id;

    teacher = await authContextFor((await makeUser({ tenantId, permissions: ["attendance.read", "attendance.write"], scope: "CAMPUS", campusId })).id);
    amender = await authContextFor((await makeUser({ tenantId, permissions: ["attendance.read", "attendance.write", "attendance.amend"], scope: "CAMPUS", campusId })).id);
    otherCampusTeacher = await authContextFor((await makeUser({ tenantId, permissions: ["attendance.read", "attendance.write"], scope: "CAMPUS", campusId: otherCampusId })).id);
  });
  afterAll(cleanupAll);

  const save = (o: { marks: Record<string, string>; submit?: string; date?: Date; reason?: string }) =>
    saveAttendance({}, fd({ sectionId, submit: o.submit ?? "draft", marks: JSON.stringify(o.marks), ...(o.date ? { date: formatDay(o.date) } : {}), ...(o.reason ? { reason: o.reason } : {}) }));

  it("denies other campuses and unauthenticated scopes", async () => {
    current = otherCampusTeacher;
    expect((await save({ marks: { [s1]: P } })).error).toMatch(/permission/i);
    expect(await prisma.attendanceSession.count({ where: { tenantId } })).toBe(0);
  });

  it("rejects future dates, old dates without amend rights, students outside the section and foreign codes", async () => {
    current = teacher;
    expect((await save({ marks: { [s1]: P }, date: daysAgo(-1) })).error).toMatch(/future/i);
    expect((await save({ marks: { [s1]: P }, date: daysAgo(30) })).error).toMatch(/amend rights/i);
    expect((await save({ marks: { [outsider]: P } })).error).toMatch(/not in this section/i);
    expect((await save({ marks: { [s1]: foreignCode } })).error).toMatch(/unknown attendance code/i);
    expect(await prisma.attendanceRecord.count({ where: { tenantId } })).toBe(0);
  });

  it("requires every student to be marked before submitting", async () => {
    current = teacher;
    expect((await save({ marks: { [s1]: P }, submit: "submit" })).error).toMatch(/1 student has no mark/i);
    const r = await save({ marks: { [s1]: P } }); // draft is fine
    expect(r.ok).toBe(true);
  });

  it("submits, and a later draft save does not downgrade the status", async () => {
    current = teacher;
    expect((await save({ marks: { [s1]: P, [s2]: A }, submit: "submit" })).ok).toBe(true);
    const sess = await prisma.attendanceSession.findFirstOrThrow({ where: { sectionId, date: dayStart() } });
    expect(sess.status).toBe("SUBMITTED");
    expect(sess.submittedAt).not.toBeNull();
    await save({ marks: { [s1]: P, [s2]: A } });
    expect((await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sess.id } })).status).toBe("SUBMITTED");
  });

  it("blocks edits to a submitted register without amend rights, and demands a reason with them", async () => {
    current = teacher;
    expect((await save({ marks: { [s1]: P, [s2]: P }, submit: "submit" })).error).toMatch(/amend rights/i);
    current = amender;
    expect((await save({ marks: { [s1]: P, [s2]: P } })).error).toMatch(/reason/i);
    const ok = await save({ marks: { [s1]: P, [s2]: L }, reason: "Ben arrived late, bus delayed" });
    expect(ok.ok).toBe(true);
    const rec = await prisma.attendanceRecord.findFirstOrThrow({ where: { studentId: s2 } });
    expect(rec.codeId).toBe(L);
    const am = await prisma.attendanceAmendment.findMany({ where: { tenantId } });
    expect(am).toHaveLength(1);
    expect(am[0]).toMatchObject({ studentId: s2, fromCodeId: A, toCodeId: L, reason: "Ben arrived late, bus delayed" });
    expect(await prisma.auditEvent.count({ where: { chainKey: tenantId, action: "attendance.amend" } })).toBe(1);
  });

  it("an unchanged resubmit by an amender records nothing", async () => {
    current = amender;
    const r = await save({ marks: { [s1]: P, [s2]: L }, reason: "no change" });
    expect(r.message).toMatch(/no changes/i);
    expect(await prisma.attendanceAmendment.count({ where: { tenantId } })).toBe(1);
  });

  it("locking needs amend rights and a submitted register; locked registers refuse non-amenders", async () => {
    const sess = await prisma.attendanceSession.findFirstOrThrow({ where: { sectionId, date: dayStart() } });
    current = teacher;
    expect((await lockAttendanceRegister({}, fd({ sessionId: sess.id }))).error).toMatch(/permission/i);
    current = amender;
    expect((await lockAttendanceRegister({}, fd({ sessionId: sess.id }))).ok).toBe(true);
    expect((await lockAttendanceRegister({}, fd({ sessionId: sess.id }))).error).toMatch(/only a submitted/i);
    current = teacher;
    expect((await save({ marks: { [s1]: A, [s2]: L } })).error).toMatch(/locked/i);
  });

  it("allows an amender to back-date a register and reports only submitted/locked data within scope", async () => {
    current = amender;
    const d = daysAgo(20);
    expect((await save({ marks: { [s1]: P, [s2]: A }, date: d, submit: "submit" })).ok).toBe(true);
    // a draft register must not count
    current = teacher;
    await save({ marks: { [s1]: A }, date: daysAgo(2) });

    const rep = await attendanceReport({ tenantId, campusIds: [campusId], from: daysAgo(30), to: dayStart() });
    expect(rep.sessions).toBe(2);
    const ben = rep.students.find((s) => s.studentId === s2)!;
    // today: Late (counts present); 20 days ago: Absent
    expect(ben.tally).toMatchObject({ late: 1, absent: 1, total: 2 });
    expect(ben.pct).toBe(50);
    expect(rep.daily.map((x) => x.category).sort()).toEqual(["ABSENT", "LATE"]);
    const ann = rep.students.find((s) => s.studentId === s1)!;
    expect(ann.pct).toBe(100);

    const none = await attendanceReport({ tenantId, campusIds: [otherCampusId], from: daysAgo(30), to: dayStart() });
    expect(none.students).toHaveLength(0);
  });
});
