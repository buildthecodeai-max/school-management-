import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { bulkReassignSection, bulkPromoteGrade } from "@/app/portal/students/actions";
import { cloneCampusConfig } from "@/app/portal/setup/clone-actions";
import { initiateSeparation, toggleSeparationItem, completeSeparation } from "@/app/portal/hr/actions";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("bulk student actions", () => {
  let tenantId: string, campusId: string, otherCampus: string, foreignSection: string;
  let yearId: string, gradeId: string, secA: string, secB: string, otherGradeSec: string, tinySec: string, otherCampusSec: string;
  let grade2Id: string, year2Id: string, sec2: string, sec2Tiny: string;
  let writer: unknown, reader: unknown, s1: string, s2: string, s3: string;

  beforeAll(async () => {
    tenantId = (await makeTenant("Bulk Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    s1 = (await makeStudent({ tenantId, campusId, firstName: "Ann", lastName: "One", admissionNumber: uid("A") })).id;
    const en = await prisma.enrollment.findFirstOrThrow({ where: { studentId: s1 } });
    secA = en.sectionId; yearId = en.academicYearId; gradeId = en.gradeLevelId;
    const mkSec = (name: string, o: Record<string, unknown> = {}) => prisma.section.create({ data: { tenantId, campusId, academicYearId: yearId, gradeLevelId: gradeId, name, ...o } }).then((s) => s.id);
    secB = await mkSec("B"); tinySec = await mkSec("Tiny", { capacity: 1 });
    const mkStudent = async (n: string) => { const p = await prisma.person.create({ data: { tenantId, firstName: n, lastName: "Pupil" } }); const st = await prisma.student.create({ data: { tenantId, personId: p.id, admissionNumber: uid("X"), status: "ENROLLED" } }); await prisma.enrollment.create({ data: { tenantId, studentId: st.id, campusId, academicYearId: yearId, gradeLevelId: gradeId, sectionId: secA, status: "ACTIVE", rollNumber: 7 } }); return st.id; };
    s2 = await mkStudent("Ben"); s3 = await mkStudent("Cat");
    const g2 = await prisma.gradeLevel.create({ data: { tenantId, campusId, name: uid("G2"), rank: 2 } });
    grade2Id = g2.id;
    otherGradeSec = (await prisma.section.create({ data: { tenantId, campusId, academicYearId: yearId, gradeLevelId: g2.id, name: "G2-sec" } })).id;
    const y2 = await prisma.academicYear.create({ data: { tenantId, campusId, name: uid("AY2"), startDate: new Date("2027-01-01"), endDate: new Date("2027-12-31") } });
    year2Id = y2.id;
    sec2 = (await prisma.section.create({ data: { tenantId, campusId, academicYearId: y2.id, gradeLevelId: g2.id, name: "P2" } })).id;
    sec2Tiny = (await prisma.section.create({ data: { tenantId, campusId, academicYearId: y2.id, gradeLevelId: g2.id, name: "P2-tiny", capacity: 2 } })).id;
    const oc = await makeStudent({ tenantId, campusId: otherCampus, firstName: "O", lastName: "C", admissionNumber: uid("O") });
    otherCampusSec = (await prisma.enrollment.findFirstOrThrow({ where: { studentId: oc.id } })).sectionId;
    const t2 = (await makeTenant("Other Bulk Org")).id; const c2 = (await makeCampus(t2, "X")).id;
    const f = await makeStudent({ tenantId: t2, campusId: c2, firstName: "F", lastName: "S", admissionNumber: uid("F") });
    foreignSection = (await prisma.enrollment.findFirstOrThrow({ where: { studentId: f.id } })).sectionId;
    writer = await authContextFor((await makeUser({ tenantId, permissions: ["student.write", "student.read"], scope: "CAMPUS", campusId })).id);
    reader = await authContextFor((await makeUser({ tenantId, permissions: ["student.read"], scope: "CAMPUS", campusId })).id);
  });
  afterAll(cleanupAll);

  const active = (sectionId: string) => prisma.enrollment.count({ where: { sectionId, status: "ACTIVE" } });

  it("reassigns a section only within the school, campus, grade and year, previewing first", async () => {
    current = reader;
    expect((await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: secB, mode: "preview" }))).error).toMatch(/permission/i);
    current = writer;
    expect((await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: foreignSection, mode: "preview" }))).error).toMatch(/choose both/i);
    expect((await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: secA, mode: "preview" }))).error).toMatch(/two different/i);
    expect((await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: otherCampusSec, mode: "preview" }))).error).toMatch(/same campus/i);
    expect((await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: otherGradeSec, mode: "preview" }))).error).toMatch(/same grade and academic year/i);
    expect((await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: tinySec, mode: "preview" }))).error).toMatch(/free place/i);
    const pv = await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: secB, mode: "preview" }));
    expect(pv).toMatchObject({ ok: true, affectedCount: 3 });
    expect(await active(secA)).toBe(3); // preview changed nothing
    // "false"-ish values must not commit: only mode=commit does
    expect((await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: secB, mode: "false" }))).message).toMatch(/Confirm to apply/);
    expect(await active(secA)).toBe(3);
    const done = await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: secB, mode: "commit" }));
    expect(done).toMatchObject({ ok: true, affectedCount: 3 });
    expect(await active(secA)).toBe(0);
    expect(await active(secB)).toBe(3);
    expect((await prisma.enrollment.findFirstOrThrow({ where: { studentId: s2, status: "ACTIVE" } })).rollNumber).toBeNull();
    expect((await bulkReassignSection({}, fd({ fromSectionId: secA, toSectionId: secB, mode: "commit" }))).error).toMatch(/no active students/i);
  });

  it("promotes into a later year with consistent targets, capacity and no double promotion", async () => {
    current = reader;
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: sec2, mode: "preview" }))).error).toMatch(/permission/i);
    current = writer;
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: foreignSection, mode: "preview" }))).error).toMatch(/choose the grade/i);
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: otherCampusSec, mode: "preview" }))).error).toMatch(/same campus/i);
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: secB, mode: "preview" }))).error).toMatch(/different grade/i);
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: otherGradeSec, mode: "preview" }))).error).toMatch(/already enrolled/i); // same year
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: sec2Tiny, mode: "preview" }))).error).toMatch(/free place/i);
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: sec2, mode: "preview" }))).affectedCount).toBe(3);
    expect(await prisma.enrollment.count({ where: { tenantId, gradeLevelId: grade2Id } })).toBe(0);
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: sec2, mode: "commit" }))).ok).toBe(true);
    expect(await prisma.enrollment.count({ where: { tenantId, gradeLevelId: gradeId, status: "ACTIVE" } })).toBe(0);
    expect(await prisma.enrollment.count({ where: { tenantId, gradeLevelId: gradeId, status: "COMPLETED" } })).toBe(3);
    const now = await prisma.enrollment.findMany({ where: { tenantId, studentId: s1, status: "ACTIVE" } });
    expect(now).toHaveLength(1);
    expect(now[0]).toMatchObject({ sectionId: sec2, gradeLevelId: grade2Id, academicYearId: year2Id });
    expect((await bulkPromoteGrade({}, fd({ fromGradeLevelId: gradeId, toSectionId: sec2, mode: "commit" }))).error).toMatch(/no active students/i);
    expect(await prisma.auditEvent.count({ where: { chainKey: tenantId, action: { in: ["student.bulk.reassign", "student.bulk.promote"] } } })).toBe(2);
  });
});

describe("campus configuration clone", () => {
  let tenantId: string, src: string, dst: string, dst2: string, admin: unknown, outsider: unknown;
  beforeAll(async () => {
    tenantId = (await makeTenant("Clone Org")).id;
    src = (await makeCampus(tenantId, "Src")).id; dst = (await makeCampus(tenantId, "Dst")).id; dst2 = (await makeCampus(tenantId, "Dst2")).id;
    const year = await prisma.academicYear.create({ data: { tenantId, campusId: src, name: "2026", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") } });
    await prisma.term.create({ data: { tenantId, academicYearId: year.id, name: "T1", startDate: new Date("2026-01-01"), endDate: new Date("2026-04-01") } });
    const g = await prisma.gradeLevel.create({ data: { tenantId, campusId: src, name: "Grade 1", rank: 1 } });
    await prisma.section.create({ data: { tenantId, campusId: src, academicYearId: year.id, gradeLevelId: g.id, name: "A", capacity: 30 } });
    const head = await prisma.feeHead.create({ data: { tenantId, code: uid("T"), name: "Tuition" } });
    const fs = await prisma.feeStructure.create({ data: { tenantId, campusId: src, gradeLevelId: g.id, academicYearId: year.id, name: "Grade 1 fees" } });
    await prisma.feeStructureLine.create({ data: { tenantId, structureId: fs.id, feeHeadId: head.id, amount: 100000 } });
    admin = await authContextFor((await makeUser({ tenantId, permissions: ["campus.write"], scope: "ORG" })).id);
    outsider = await authContextFor((await makeUser({ tenantId, permissions: ["campus.write"], scope: "CAMPUS", campusId: src })).id);
  });
  afterAll(cleanupAll);

  const clone = (o: Record<string, string>) => cloneCampusConfig({}, fd({ sourceCampusId: src, targetCampusId: dst, cloneAcademicStructure: "true", cloneFeeStructures: "true", cloneAssessmentPlans: "true", mode: "preview", ...o }));

  it("validates the request", async () => {
    current = outsider;
    expect((await clone({})).error).toMatch(/permission denied on target/i);
    current = admin;
    expect((await clone({ targetCampusId: src })).error).toMatch(/different/i);
    expect((await clone({ cloneAcademicStructure: "", cloneFeeStructures: "", cloneAssessmentPlans: "" })).error).toMatch(/choose what/i);
    expect((await clone({ cloneFeeStructures: "", cloneAcademicStructure: "", cloneAssessmentPlans: "true" })).error).toMatch(/academic structure too/i);
    expect((await clone({ cloneAcademicStructure: "", cloneAssessmentPlans: "", cloneFeeStructures: "true" })).error).toMatch(/tied to grade levels/i);
    expect((await clone({ targetCampusId: "nope" })).error).toMatch(/permission|not found/i);
  });

  it("previews without writing, then copies once into an empty campus; fees start inactive", async () => {
    current = admin;
    const pv = await clone({});
    expect(pv.ok).toBe(true);
    expect(pv.preview).toMatchObject({ academicYears: 1, terms: 1, gradeLevels: 1, sections: 1, feeStructures: 1 });
    expect(await prisma.gradeLevel.count({ where: { campusId: dst } })).toBe(0);
    expect((await clone({ mode: "false" })).message).toMatch(/preview/i); // only mode=commit writes
    expect(await prisma.gradeLevel.count({ where: { campusId: dst } })).toBe(0);
    expect((await clone({ mode: "commit" })).ok).toBe(true);
    expect(await prisma.gradeLevel.count({ where: { campusId: dst } })).toBe(1);
    expect(await prisma.section.count({ where: { campusId: dst } })).toBe(1);
    const fs = await prisma.feeStructure.findFirstOrThrow({ where: { campusId: dst }, include: { lines: true } });
    expect(fs.active).toBe(false);
    expect(fs.lines).toHaveLength(1);
    const yr = await prisma.academicYear.findFirstOrThrow({ where: { campusId: dst } });
    expect(yr.isCurrent).toBe(false);
    // a second copy into the same campus would duplicate everything: refused
    expect((await clone({ mode: "commit" })).error).toMatch(/already has/i);
    expect(await prisma.gradeLevel.count({ where: { campusId: dst } })).toBe(1);
    // an empty campus is fine
    expect((await clone({ targetCampusId: dst2, mode: "commit" })).ok).toBe(true);
  });
});

describe("staff separation checklists", () => {
  let tenantId: string, campusId: string, staffId: string, retiredId: string, hr: unknown, plain: unknown, foreignChecklist: string;
  beforeAll(async () => {
    tenantId = (await makeTenant("HR Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    const mk = async (ended: boolean) => {
      const person = await prisma.person.create({ data: { tenantId, firstName: "Sam", lastName: uid("s") } });
      const staff = await prisma.staff.create({ data: { tenantId, personId: person.id, employeeNumber: uid("E") } });
      const dept = await prisma.department.create({ data: { tenantId, campusId, name: uid("D") } });
      const pos = await prisma.position.create({ data: { tenantId, departmentId: dept.id, title: "T" } });
      await prisma.employmentRecord.create({ data: { tenantId, campusId, staffId: staff.id, positionId: pos.id, startDate: new Date("2025-01-01"), endDate: ended ? new Date("2025-06-01") : null } });
      return staff.id;
    };
    staffId = await mk(false); retiredId = await mk(true);
    hr = await authContextFor((await makeUser({ tenantId, permissions: ["hr.separation.manage"], scope: "CAMPUS", campusId })).id);
    plain = await authContextFor((await makeUser({ tenantId, permissions: ["hr.staff.read"], scope: "CAMPUS", campusId })).id);
    const t2 = (await makeTenant("Other HR Org")).id; const c2 = (await makeCampus(t2, "X")).id;
    const p2 = await prisma.person.create({ data: { tenantId: t2, firstName: "Far", lastName: "Staff" } });
    const st2 = await prisma.staff.create({ data: { tenantId: t2, personId: p2.id, employeeNumber: uid("E") } });
    foreignChecklist = (await prisma.separationChecklist.create({ data: { tenantId: t2, campusId: c2, staffId: st2.id, reason: "x", lastWorkDay: new Date(), items: [{ label: "a", done: true }] } })).id;
  });
  afterAll(cleanupAll);

  it("starts a checklist only for current staff, with rights, once", async () => {
    const start = (o: Record<string, string> = {}) => initiateSeparation({}, fd({ staffId, reason: "Resigned", lastWorkDay: "2026-12-31", ...o }));
    current = plain;
    expect((await start()).error).toMatch(/permission/i);
    current = hr;
    expect((await start({ staffId: retiredId })).error).toMatch(/not currently employed/i);
    expect((await start({ reason: "" })).error).toMatch(/reason/i);
    expect((await start({ lastWorkDay: "soon" })).error).toMatch(/last working day/i);
    expect((await start()).ok).toBe(true);
    expect((await start()).error).toMatch(/already an open/i);
  });

  it("ticks items, refuses completion until all are done, and ignores other schools' checklists", async () => {
    current = hr;
    const c = await prisma.separationChecklist.findFirstOrThrow({ where: { tenantId, staffId } });
    expect((c.items as unknown[]).length).toBe(5);
    expect((await completeSeparation({}, fd({ checklistId: c.id }))).error).toMatch(/5 item\(s\) are still open/);
    expect((await toggleSeparationItem({}, fd({ checklistId: c.id, index: "9" }))).error).toMatch(/not found/i);
    expect((await toggleSeparationItem({}, fd({ checklistId: foreignChecklist, index: "0" }))).error).toMatch(/not found/i);
    for (let i = 0; i < 5; i++) expect((await toggleSeparationItem({}, fd({ checklistId: c.id, index: String(i) }))).ok).toBe(true);
    expect((await toggleSeparationItem({}, fd({ checklistId: c.id, index: "0" }))).message).toMatch(/unticked/i);
    expect((await completeSeparation({}, fd({ checklistId: c.id }))).error).toMatch(/1 item\(s\)/);
    await toggleSeparationItem({}, fd({ checklistId: c.id, index: "0" }));
    current = plain;
    expect((await completeSeparation({}, fd({ checklistId: c.id }))).error).toMatch(/permission/i);
    current = hr;
    expect((await completeSeparation({}, fd({ checklistId: c.id }))).ok).toBe(true);
    expect((await prisma.separationChecklist.findUniqueOrThrow({ where: { id: c.id } })).completedAt).not.toBeNull();
    expect((await toggleSeparationItem({}, fd({ checklistId: c.id, index: "0" }))).error).toMatch(/already complete/i);
    expect((await prisma.separationChecklist.findUniqueOrThrow({ where: { id: foreignChecklist } })).completedAt).toBeNull();
  });
});
