import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { createTimetableVersion, addTimetableSlot, removeTimetableSlot, publishTimetableVersion } from "@/app/portal/academics/timetable/actions";
import { saveCompetencyRatings, seedDefaultCompetencies } from "@/app/portal/exams/scheduling-actions";
import { publishResults, setPlanStatus, saveMarks } from "@/app/portal/exams/actions";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("timetable editor", () => {
  let tenantId: string, campusId: string, otherCampus: string, yearId: string, otherYear: string;
  let sectionId: string, otherSection: string, subjectId: string, staffId: string, roomId: string, foreignStaff: string;
  let writer: unknown, reader: unknown, versionId: string;

  beforeAll(async () => {
    tenantId = (await makeTenant("TT Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    const st = await makeStudent({ tenantId, campusId, firstName: "T", lastName: "S", admissionNumber: uid("AD") });
    const en = await prisma.enrollment.findFirstOrThrow({ where: { studentId: st.id } });
    sectionId = en.sectionId; yearId = en.academicYearId;
    const o = await makeStudent({ tenantId, campusId: otherCampus, firstName: "O", lastName: "S", admissionNumber: uid("AD") });
    const oen = await prisma.enrollment.findFirstOrThrow({ where: { studentId: o.id } });
    otherSection = oen.sectionId; otherYear = oen.academicYearId;
    subjectId = (await prisma.subject.create({ data: { tenantId, code: uid("S"), name: "Maths" } })).id;
    roomId = (await prisma.room.create({ data: { tenantId, campusId, code: "R1", name: "Room 1" } })).id;
    const mkStaff = async (campus: string) => {
      const person = await prisma.person.create({ data: { tenantId, firstName: "Tea", lastName: uid("c") } });
      const staff = await prisma.staff.create({ data: { tenantId, personId: person.id, employeeNumber: uid("E") } });
      const dept = await prisma.department.create({ data: { tenantId, campusId: campus, name: uid("D") } });
      const pos = await prisma.position.create({ data: { tenantId, departmentId: dept.id, title: "T" } });
      await prisma.employmentRecord.create({ data: { tenantId, campusId: campus, staffId: staff.id, positionId: pos.id, startDate: new Date("2026-01-01") } });
      return staff.id;
    };
    staffId = await mkStaff(campusId); foreignStaff = await mkStaff(otherCampus);
    writer = await authContextFor((await makeUser({ tenantId, permissions: ["timetable.read", "timetable.write", "timetable.publish"], scope: "CAMPUS", campusId })).id);
    reader = await authContextFor((await makeUser({ tenantId, permissions: ["timetable.read"], scope: "CAMPUS", campusId })).id);
  });
  afterAll(cleanupAll);

  const slot = (o: Record<string, string> = {}) =>
    addTimetableSlot({}, fd({ versionId, sectionId, subjectId, dayOfWeek: "MON", periodNumber: "1", startTime: "08:00", endTime: "08:45", ...o }));

  it("creates versions from the year's campus and refuses other campuses and duplicate names", async () => {
    current = reader;
    expect((await createTimetableVersion({}, fd({ academicYearId: yearId, name: "T1" }))).error).toMatch(/permission/i);
    current = writer;
    expect((await createTimetableVersion({}, fd({ academicYearId: otherYear, name: "T1" }))).error).toMatch(/permission/i);
    const r = await createTimetableVersion({}, fd({ academicYearId: yearId, name: "T1" }));
    expect(r.ok).toBe(true);
    versionId = r.versionId!;
    expect((await createTimetableVersion({}, fd({ academicYearId: yearId, name: "T1" }))).error).toMatch(/already exists/i);
  });

  it("validates times and references", async () => {
    current = writer;
    expect((await slot({ startTime: "09:00", endTime: "08:00" })).error).toMatch(/valid times/i);
    expect((await slot({ sectionId: otherSection })).error).toMatch(/section not found/i);
    expect((await slot({ staffId: foreignStaff })).error).toMatch(/does not work/i);
    expect((await slot({ roomId: "nope" })).error).toMatch(/room not found/i);
    expect(await prisma.timetableSlot.count({ where: { versionId } })).toBe(0);
  });

  it("adds a slot, blocks teacher and room double-booking, removes, and publishes only non-empty drafts", async () => {
    current = writer;
    expect((await publishTimetableVersion({}, fd({ versionId }))).error).toMatch(/at least one slot/i);
    expect((await slot({ staffId, roomId })).ok).toBe(true);
    const second = await prisma.section.create({ data: { tenantId, campusId, academicYearId: yearId, gradeLevelId: (await prisma.section.findUniqueOrThrow({ where: { id: sectionId } })).gradeLevelId, name: uid("S2") } });
    expect((await slot({ sectionId: second.id, staffId })).error).toMatch(/conflict.*staff/i);
    expect((await slot({ sectionId: second.id, roomId })).error).toMatch(/conflict.*room/i);
    expect((await slot({ sectionId: second.id, periodNumber: "2", staffId })).ok).toBe(true);

    const s = await prisma.timetableSlot.findFirstOrThrow({ where: { versionId, periodNumber: 2 } });
    expect((await removeTimetableSlot({}, fd({ slotId: s.id }))).ok).toBe(true);

    expect((await publishTimetableVersion({}, fd({ versionId }))).ok).toBe(true);
    expect((await slot({ periodNumber: "3" })).error).toMatch(/only draft/i);
    const first = await prisma.timetableSlot.findFirstOrThrow({ where: { versionId } });
    expect((await removeTimetableSlot({}, fd({ slotId: first.id }))).error).toMatch(/only draft/i);
  });
});

describe("competency ratings", () => {
  let tenantId: string, campusId: string, s1: string, planId: string, subjectId: string, compId: string;
  let teacher: unknown, approver: unknown, outsiderTeacher: unknown, resultId: string, cId: string;

  beforeAll(async () => {
    tenantId = (await makeTenant("Comp Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    const otherCampus = (await makeCampus(tenantId, "B")).id;
    s1 = (await makeStudent({ tenantId, campusId, firstName: "A", lastName: "One", admissionNumber: uid("AD") })).id;
    const en = await prisma.enrollment.findFirstOrThrow({ where: { studentId: s1 } });
    const term = await prisma.term.create({ data: { tenantId, academicYearId: en.academicYearId, name: "T1", startDate: new Date("2026-01-01"), endDate: new Date("2026-04-01") } });
    const scale = await prisma.gradeScale.create({ data: { tenantId, name: "S", bands: { create: [{ tenantId, grade: "A", minPercent: 0, gradePoint: 4, isPass: true }] } } });
    subjectId = (await prisma.subject.create({ data: { tenantId, code: uid("M"), name: "Math" } })).id;
    planId = (await prisma.assessmentPlan.create({ data: { tenantId, campusId, sectionId: en.sectionId, termId: term.id, name: "P", gradeScaleId: scale.id } })).id;
    compId = (await prisma.assessmentComponent.create({ data: { tenantId, planId, name: "Exam", weight: 100, maxMarks: 100 } })).id;
    await prisma.planSubject.create({ data: { tenantId, planId, subjectId } });
    teacher = await authContextFor((await makeUser({ tenantId, permissions: ["exams.read", "exams.enter", "exams.manage"], scope: "CAMPUS", campusId })).id);
    approver = await authContextFor((await makeUser({ tenantId, permissions: ["exams.read", "exams.approve"], scope: "CAMPUS", campusId })).id);
    outsiderTeacher = await authContextFor((await makeUser({ tenantId, permissions: ["exams.enter"], scope: "CAMPUS", campusId: otherCampus })).id);
    current = teacher;
    await saveMarks({}, fd({ planId, subjectId, submit: "submit", entries: JSON.stringify([{ studentId: s1, componentId: compId, marks: "70", status: "NORMAL" }]) }));
    current = approver;
    await setPlanStatus({}, fd({ planId, status: "APPROVED" }));
    await publishResults({}, fd({ planId }));
    resultId = (await prisma.studentResult.findFirstOrThrow({ where: { tenantId, studentId: s1 } })).id;
  });
  afterAll(cleanupAll);

  it("seeds the standard competencies once, only for exams.manage", async () => {
    current = approver;
    expect((await seedDefaultCompetencies({}, fd({}))).error).toMatch(/denied/i);
    current = teacher;
    expect((await seedDefaultCompetencies({}, fd({}))).message).toMatch(/added/i);
    expect((await seedDefaultCompetencies({}, fd({}))).message).toMatch(/already exist/i);
    expect(await prisma.competency.count({ where: { tenantId } })).toBe(5);
    cId = (await prisma.competency.findFirstOrThrow({ where: { tenantId, code: "COMM" } })).id;
  });

  it("validates ratings, campus rights and tenant ownership", async () => {
    current = outsiderTeacher;
    expect((await saveCompetencyRatings({}, fd({ studentResultId: resultId, [`rating:${cId}`]: "3" }))).error).toMatch(/denied/i);
    current = teacher;
    expect((await saveCompetencyRatings({}, fd({ studentResultId: resultId, [`rating:${cId}`]: "7" }))).error).toMatch(/between 1 and 4/i);
    expect((await saveCompetencyRatings({}, fd({ studentResultId: "missing", [`rating:${cId}`]: "3" }))).error).toMatch(/not found/i);
    expect(await prisma.studentCompetencyRating.count({ where: { tenantId } })).toBe(0);
  });

  it("saves, updates and clears ratings with a conduct remark", async () => {
    current = teacher;
    expect((await saveCompetencyRatings({}, fd({ studentResultId: resultId, [`rating:${cId}`]: "3", [`comment:${cId}`]: "Clear speaker", conductRemark: "Polite" }))).ok).toBe(true);
    let r = await prisma.studentResult.findUniqueOrThrow({ where: { id: resultId }, include: { competencyRatings: true } });
    expect(r.conductRemark).toBe("Polite");
    expect(r.competencyRatings).toHaveLength(1);
    expect(r.competencyRatings[0]).toMatchObject({ rating: 3, comment: "Clear speaker" });
    await saveCompetencyRatings({}, fd({ studentResultId: resultId, [`rating:${cId}`]: "", conductRemark: "Polite" }));
    r = await prisma.studentResult.findUniqueOrThrow({ where: { id: resultId }, include: { competencyRatings: true } });
    expect(r.competencyRatings).toHaveLength(0);
  });

  it("carries ratings and conduct over when results are corrected and republished", async () => {
    current = teacher;
    await saveCompetencyRatings({}, fd({ studentResultId: resultId, [`rating:${cId}`]: "4", conductRemark: "Excellent" }));
    current = approver;
    await setPlanStatus({}, fd({ planId, status: "OPEN", reason: "Correct a mark" }));
    current = teacher;
    await saveMarks({}, fd({ planId, subjectId, submit: "submit", entries: JSON.stringify([{ studentId: s1, componentId: compId, marks: "75", status: "NORMAL" }]) }));
    current = approver;
    await setPlanStatus({}, fd({ planId, status: "APPROVED" }));
    expect((await publishResults({}, fd({ planId, reason: "Correction" }))).ok).toBe(true);
    const latest = await prisma.studentResult.findFirstOrThrow({ where: { tenantId, studentId: s1, version: { status: "PUBLISHED" } }, include: { competencyRatings: true } });
    expect(latest.id).not.toBe(resultId);
    expect(latest.conductRemark).toBe("Excellent");
    expect(latest.competencyRatings.map((c) => c.rating)).toEqual([4]);
  });
});
