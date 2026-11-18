import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({
  ...(await orig<typeof import("@/lib/rbac")>()),
  requireUser: async () => current,
}));

import * as C from "@/app/portal/academics/config/actions";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const run = (fn: (p: C.CfgState, f: FormData) => Promise<C.CfgState>, o: Record<string, string>) => fn({}, fd(o));

// Academic configuration is the base every other module depends on, so its
// rules (permission, tenant isolation, overlaps, delete guards) are pinned here.
describe("academic configuration actions", () => {
  let tenantId: string, campusA: string, campusB: string;
  let admin: unknown, viewer: unknown, campusAOnly: unknown, outsider: unknown;
  const PERMS = ["academics.read", "academics.write", "exams.manage", "attendance.write", "hr.staff.write"];

  beforeAll(async () => {
    tenantId = (await makeTenant("Config Org")).id;
    campusA = (await makeCampus(tenantId, "A")).id;
    campusB = (await makeCampus(tenantId, "B")).id;
    admin = await authContextFor((await makeUser({ tenantId, permissions: PERMS, scope: "ORG" })).id);
    viewer = await authContextFor((await makeUser({ tenantId, permissions: ["academics.read"], scope: "ORG" })).id);
    campusAOnly = await authContextFor((await makeUser({ tenantId, permissions: PERMS, scope: "CAMPUS", campusId: campusA })).id);
    const other = (await makeTenant("Other Org")).id;
    outsider = await authContextFor((await makeUser({ tenantId: other, permissions: PERMS, scope: "ORG" })).id);
  });
  afterAll(cleanupAll);

  it("denies users without write rights, users of another school, and campus-only users on tenant-wide config", async () => {
    current = viewer;
    expect((await run(C.createGradeLevel, { campusId: campusA, name: "G1" })).error).toMatch(/permission/i);
    current = outsider;
    expect((await run(C.createGradeLevel, { campusId: campusA, name: "G1" })).error).toMatch(/permission/i);
    current = campusAOnly;
    expect((await run(C.createGradeLevel, { campusId: campusB, name: "G1" })).error).toMatch(/permission/i);
    // Attendance codes change every campus, so rights on one campus are not enough.
    expect((await run(C.createAttendanceCode, { code: "P", label: "Present", category: "PRESENT" })).error).toMatch(/permission/i);
    expect(await prisma.gradeLevel.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.attendanceCode.count({ where: { tenantId } })).toBe(0);
  });

  it("academic years: first is current, overlaps and bad dates are refused, switching current works", async () => {
    current = admin;
    expect((await run(C.createAcademicYear, { campusId: campusA, name: "2026", startDate: "2026-01-01", endDate: "2026-12-31" })).ok).toBe(true);
    expect((await prisma.academicYear.findFirstOrThrow({ where: { campusId: campusA } })).isCurrent).toBe(true);
    expect((await run(C.createAcademicYear, { campusId: campusA, name: "x", startDate: "2026-06-01", endDate: "2027-03-01" })).error).toMatch(/overlap/i);
    expect((await run(C.createAcademicYear, { campusId: campusA, name: "2026", startDate: "2028-01-01", endDate: "2028-12-31" })).error).toMatch(/already/i);
    expect((await run(C.createAcademicYear, { campusId: campusA, name: "bad", startDate: "2029-12-31", endDate: "2029-01-01" })).error).toMatch(/after/i);
    expect((await run(C.createAcademicYear, { campusId: campusA, name: "2027", startDate: "2027-01-01", endDate: "2027-12-31" })).ok).toBe(true);
    const y27 = await prisma.academicYear.findFirstOrThrow({ where: { campusId: campusA, name: "2027" } });
    expect(y27.isCurrent).toBe(false);
    await run(C.setCurrentAcademicYear, { id: y27.id });
    const current27 = await prisma.academicYear.findMany({ where: { campusId: campusA, isCurrent: true } });
    expect(current27.map((y) => y.name)).toEqual(["2027"]);
  });

  it("terms stay inside their year and may not overlap", async () => {
    current = admin;
    const y = await prisma.academicYear.findFirstOrThrow({ where: { campusId: campusA, name: "2026" } });
    const t = (o: Record<string, string>) => run(C.createTerm, { academicYearId: y.id, ...o });
    expect((await t({ name: "T1", startDate: "2026-01-10", endDate: "2026-04-10" })).ok).toBe(true);
    expect((await t({ name: "T2", startDate: "2026-04-01", endDate: "2026-07-01" })).error).toMatch(/overlap/i);
    expect((await t({ name: "T3", startDate: "2025-12-01", endDate: "2026-02-01" })).error).toMatch(/within/i);
    expect((await t({ name: "T1", startDate: "2026-08-01", endDate: "2026-09-01" })).error).toMatch(/already/i);
    expect((await t({ name: "T2", startDate: "2026-05-01", endDate: "2026-08-01" })).ok).toBe(true);
    // Shrinking the year so a term falls outside is refused.
    const bad = await run(C.updateAcademicYear, { id: y.id, name: "2026", startDate: "2026-01-01", endDate: "2026-06-30" });
    expect(bad.error).toMatch(/outside/i);
  });

  it("grades, sections and their delete guards", async () => {
    current = admin;
    expect((await run(C.createGradeLevel, { campusId: campusA, name: "Grade 1", rank: "1" })).ok).toBe(true);
    expect((await run(C.createGradeLevel, { campusId: campusA, name: "grade 1", rank: "2" })).error).toMatch(/already/i);
    const grade = await prisma.gradeLevel.findFirstOrThrow({ where: { campusId: campusA, name: "Grade 1" } });
    const year = await prisma.academicYear.findFirstOrThrow({ where: { campusId: campusA, name: "2026" } });
    const sec = (o: Record<string, string>) => run(C.createSection, { campusId: campusA, gradeLevelId: grade.id, academicYearId: year.id, ...o });
    expect((await sec({ name: "A", capacity: "30" })).ok).toBe(true);
    expect((await sec({ name: "a", capacity: "30" })).error).toMatch(/already/i);
    expect((await sec({ name: "B", capacity: "0" })).error).toMatch(/capacity/i);
    // A grade from another campus cannot be used here.
    const foreign = await prisma.gradeLevel.create({ data: { tenantId, campusId: campusB, name: "B-grade", rank: 1 } });
    expect((await run(C.createSection, { campusId: campusA, gradeLevelId: foreign.id, academicYearId: year.id, name: "Z" })).error).toMatch(/campus/i);

    expect((await run(C.deleteGradeLevel, { id: grade.id })).error).toMatch(/in use/i);

    const section = await prisma.section.findFirstOrThrow({ where: { campusId: campusA, name: "A" } });
    expect((await run(C.deleteSection, { id: section.id })).ok).toBe(true);
    expect(await prisma.section.count({ where: { id: section.id } })).toBe(0);
  });

  it("refuses to delete or shrink a section that has students enrolled", async () => {
    current = admin;
    const student = await makeStudent({ tenantId, campusId: campusB, firstName: "Sam", lastName: "Pupil", admissionNumber: uid("S") });
    const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { studentId: student.id } });
    expect((await run(C.deleteSection, { id: enrollment.sectionId })).error).toMatch(/cannot be deleted/i);
    expect((await run(C.updateSection, { id: enrollment.sectionId, name: "Renamed", capacity: "1" })).ok).toBe(true);
    await prisma.enrollment.create({
      data: { tenantId, studentId: student.id, campusId: campusB, academicYearId: enrollment.academicYearId, gradeLevelId: enrollment.gradeLevelId, sectionId: enrollment.sectionId, status: "ACTIVE" },
    });
    expect((await run(C.updateSection, { id: enrollment.sectionId, name: "Renamed", capacity: "1" })).error).toMatch(/capacity cannot be lower/i);
    expect((await run(C.deleteGradeLevel, { id: enrollment.gradeLevelId })).error).toMatch(/in use/i);
    expect((await run(C.deleteAcademicYear, { id: enrollment.academicYearId })).error).toMatch(/in use/i);
    expect(await prisma.enrollment.count({ where: { studentId: student.id } })).toBe(2);
  });

  it("subjects and rooms: unique codes, safe deletes", async () => {
    current = admin;
    expect((await run(C.createSubject, { campusId: campusA, code: "math", name: "Mathematics" })).ok).toBe(true);
    expect((await run(C.createSubject, { campusId: campusB, code: "MATH", name: "Other" })).error).toMatch(/already exists/i);
    const subject = await prisma.subject.findFirstOrThrow({ where: { tenantId, code: "MATH" } });
    expect((await run(C.deleteSubject, { id: subject.id })).ok).toBe(true);

    expect((await run(C.createRoom, { campusId: campusA, code: "r1", name: "Room 1", capacity: "30", roomType: "LAB" })).ok).toBe(true);
    expect((await run(C.createRoom, { campusId: campusA, code: "R1", capacity: "30", roomType: "LAB" })).error).toMatch(/already has room/i);
    expect((await run(C.createRoom, { campusId: campusA, code: "R2", capacity: "30", roomType: "MOON" })).error).toMatch(/room type/i);
    expect((await run(C.createRoom, { campusId: campusB, code: "R1", capacity: "20", roomType: "HALL" })).ok).toBe(true);
  });

  it("grade scales: validated bands, unique name, cannot delete one in use", async () => {
    current = admin;
    expect((await run(C.createGradeScale, { name: "Bad", bands: "A, 90, 4\nB, 50, 3" })).error).toMatch(/0%/);
    expect((await run(C.createGradeScale, { name: "Std", bands: "A, 50, 4, pass\nF, 0, 0, fail" })).ok).toBe(true);
    expect((await run(C.createGradeScale, { name: "std", bands: "A, 50, 4, pass\nF, 0, 0, fail" })).error).toMatch(/already/i);
    const scale = await prisma.gradeScale.findFirstOrThrow({ where: { tenantId, name: "Std" }, include: { bands: true } });
    expect(scale.bands).toHaveLength(2);
    const year = await prisma.academicYear.findFirstOrThrow({ where: { campusId: campusA, name: "2026" } });
    const grade = await prisma.gradeLevel.findFirstOrThrow({ where: { campusId: campusA } });
    const term = await prisma.term.findFirstOrThrow({ where: { academicYearId: year.id } });
    const s = await prisma.section.create({ data: { tenantId, campusId: campusA, gradeLevelId: grade.id, academicYearId: year.id, name: "P" } });
    await prisma.assessmentPlan.create({ data: { tenantId, campusId: campusA, sectionId: s.id, termId: term.id, name: "Plan", gradeScaleId: scale.id } });
    expect((await run(C.deleteGradeScale, { id: scale.id })).error).toMatch(/cannot be deleted/i);
    expect((await run(C.deleteTerm, { id: term.id })).error).toMatch(/cannot be deleted/i);
  });

  it("attendance codes, leave types, departments and positions", async () => {
    current = admin;
    expect((await run(C.createAttendanceCode, { code: "p", label: "Present", category: "PRESENT", countsAsPresent: "on" })).ok).toBe(true);
    expect((await run(C.createAttendanceCode, { code: "P", label: "Dup", category: "PRESENT" })).error).toMatch(/already exists/i);
    expect((await run(C.createAttendanceCode, { code: "TOOLONG", label: "x", category: "PRESENT" })).error).toBeTruthy();
    const code = await prisma.attendanceCode.findFirstOrThrow({ where: { tenantId, code: "P" } });
    expect(code.countsAsPresent).toBe(true);

    expect((await run(C.createLeaveType, { name: "Annual", daysPerYear: "21", appliesTo: "STAFF", isPaid: "on" })).ok).toBe(true);
    expect((await run(C.createLeaveType, { name: "Annual", daysPerYear: "5", appliesTo: "STAFF" })).error).toMatch(/already/i);
    expect((await run(C.createLeaveType, { name: "Weird", daysPerYear: "999", appliesTo: "STAFF" })).error).toMatch(/366/);

    expect((await run(C.createDepartment, { campusId: campusA, name: "Science" })).ok).toBe(true);
    const dep = await prisma.department.findFirstOrThrow({ where: { campusId: campusA, name: "Science" } });
    expect((await run(C.createPosition, { departmentId: dep.id, title: "Teacher" })).ok).toBe(true);
    expect((await run(C.createPosition, { departmentId: dep.id, title: "teacher" })).error).toMatch(/already/i);
    expect((await run(C.deleteDepartment, { id: dep.id })).error).toMatch(/positions first/i);
    const pos = await prisma.position.findFirstOrThrow({ where: { departmentId: dep.id } });
    expect((await run(C.deletePosition, { id: pos.id })).ok).toBe(true);
    expect((await run(C.deleteDepartment, { id: dep.id })).ok).toBe(true);
  });

  it("writes an audit entry for configuration changes", async () => {
    expect(await prisma.auditEvent.count({ where: { chainKey: tenantId, action: { startsWith: "academics." } } })).toBeGreaterThan(5);
  });
});
