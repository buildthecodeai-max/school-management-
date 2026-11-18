import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { saveMarks, setPlanStatus, publishResults } from "@/app/portal/exams/actions";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("exam marks → approval → publication", () => {
  let tenantId: string, campusId: string, planId: string, subjectId: string, compId: string;
  let s1: string, s2: string, s3: string, outsider: string;
  let entry: unknown, approver: unknown, selfApprover: unknown;

  beforeAll(async () => {
    tenantId = (await makeTenant("Exam Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    s1 = (await makeStudent({ tenantId, campusId, firstName: "A", lastName: "One", admissionNumber: uid("AD") })).id;
    const en = await prisma.enrollment.findFirstOrThrow({ where: { studentId: s1 } });
    const extra = async (n: string) => {
      const p = await prisma.person.create({ data: { tenantId, firstName: n, lastName: "Pupil" } });
      const st = await prisma.student.create({ data: { tenantId, personId: p.id, admissionNumber: uid("AD"), status: "ENROLLED" } });
      await prisma.enrollment.create({ data: { tenantId, studentId: st.id, campusId, academicYearId: en.academicYearId, gradeLevelId: en.gradeLevelId, sectionId: en.sectionId, status: "ACTIVE" } });
      return st.id;
    };
    s2 = await extra("B"); s3 = await extra("C");
    outsider = (await makeStudent({ tenantId, campusId, firstName: "O", lastName: "Out", admissionNumber: uid("AD") })).id;

    const term = await prisma.term.create({ data: { tenantId, academicYearId: en.academicYearId, name: "T1", startDate: new Date("2026-01-01"), endDate: new Date("2026-04-01") } });
    const scale = await prisma.gradeScale.create({ data: { tenantId, name: "S", bands: { create: [
      { tenantId, grade: "A", minPercent: 50, gradePoint: 4, isPass: true },
      { tenantId, grade: "F", minPercent: 0, gradePoint: 0, isPass: false },
    ] } } });
    subjectId = (await prisma.subject.create({ data: { tenantId, campusId, name: "Math", code: uid("M") } })).id;
    const plan = await prisma.assessmentPlan.create({ data: { tenantId, campusId, sectionId: en.sectionId, termId: term.id, name: "Term 1", gradeScaleId: scale.id } });
    planId = plan.id;
    compId = (await prisma.assessmentComponent.create({ data: { tenantId, planId, name: "Exam", weight: 100, maxMarks: 100 } })).id;
    await prisma.planSubject.create({ data: { tenantId, planId, subjectId } });

    entry = await authContextFor((await makeUser({ tenantId, permissions: ["exams.read", "exams.enter"], scope: "CAMPUS", campusId })).id);
    approver = await authContextFor((await makeUser({ tenantId, permissions: ["exams.read", "exams.approve"], scope: "CAMPUS", campusId })).id);
    selfApprover = await authContextFor((await makeUser({ tenantId, permissions: ["exams.read", "exams.enter", "exams.approve"], scope: "CAMPUS", campusId })).id);
  });
  afterAll(cleanupAll);

  const grid = (rows: [string, string, string?][]) =>
    JSON.stringify(rows.map(([studentId, marks, status]) => ({ studentId, componentId: compId, marks, status: status ?? "NORMAL" })));
  const save = (rows: [string, string, string?][], submit = "save") => saveMarks({}, fd({ planId, subjectId, submit, entries: grid(rows) }));
  const status = (to: string, reason = "") => setPlanStatus({}, fd({ planId, status: to, reason }));

  it("rejects the whole grid for out-of-section students or out-of-range marks, saving nothing", async () => {
    current = entry;
    expect((await save([[s1, "50"], [outsider, "60"]])).error).toMatch(/not in this section/i);
    expect((await save([[s1, "50"], [s2, "101"]])).error).toMatch(/between 0 and 100/i);
    expect((await save([[s1, "abc"]])).error).toMatch(/numeric/i);
    expect(await prisma.markEntry.count({ where: { planId } })).toBe(0);
  });

  it("saves marks, then refuses to submit while marks are missing", async () => {
    current = entry;
    expect((await save([[s1, "80"], [s2, "70"]])).ok).toBe(true);
    const r = await save([[s1, "80"], [s2, "70"]], "submit");
    expect(r.error).toMatch(/1 mark\(s\) are still missing/);
    expect((await prisma.assessmentPlan.findUniqueOrThrow({ where: { id: planId } })).status).toBe("OPEN");
  });

  it("blocks forced status jumps and approval of incomplete plans", async () => {
    current = approver;
    expect((await status("PUBLISHED")).error).toMatch(/cannot move/i);
    expect((await status("APPROVED")).error).toMatch(/cannot move/i); // OPEN -> APPROVED not allowed
    current = entry;
    expect((await status("SUBMITTED")).error).toMatch(/still missing/i);
  });

  it("submits a complete plan; the data entrant cannot approve; an independent approver can", async () => {
    current = entry;
    expect((await save([[s1, "80"], [s2, "70"], [s3, "70"]], "submit")).ok).toBe(true);
    expect((await save([[s1, "10"]])).error).toMatch(/closed/i);
    current = selfApprover;
    await prisma.markEntry.updateMany({ where: { planId, studentId: s3 }, data: { enteredByUserId: (selfApprover as { user: { id: string } }).user.id } });
    expect((await status("APPROVED")).error).toMatch(/someone else/i);
    current = entry;
    expect((await status("APPROVED")).error).toMatch(/rights/i);
    current = approver;
    expect((await status("APPROVED")).ok).toBe(true);
  });

  it("publishes with tied ranks and keeps a superseded version after a corrected republish", async () => {
    current = entry;
    expect((await publishResults({}, fd({ planId }))).error).toMatch(/approval rights/i);
    current = approver;
    const pub = await publishResults({}, fd({ planId }));
    expect(pub.ok).toBe(true);
    const v1 = await prisma.resultVersion.findFirstOrThrow({ where: { planId, version: 1 }, include: { results: true } });
    const ranks = Object.fromEntries(v1.results.map((r) => [r.studentId, r.rank]));
    expect(ranks).toEqual({ [s1]: 1, [s2]: 2, [s3]: 2 });
    // cannot publish twice without reopening
    expect((await publishResults({}, fd({ planId }))).error).toMatch(/approved before/i);

    expect((await status("OPEN")).error).toMatch(/reason/i);
    expect((await status("OPEN", "Maths mark corrected")).ok).toBe(true);
    current = entry;
    expect((await save([[s3, "95"]])).ok).toBe(true);
    expect((await status("SUBMITTED")).ok).toBe(true);
    current = approver;
    expect((await status("APPROVED")).ok).toBe(true);
    expect((await publishResults({}, fd({ planId, reason: "Correction" }))).ok).toBe(true);
    const versions = await prisma.resultVersion.findMany({ where: { planId }, orderBy: { version: "asc" } });
    expect(versions.map((v) => v.status)).toEqual(["SUPERSEDED", "PUBLISHED"]);
    const v2 = await prisma.studentResult.findMany({ where: { resultVersionId: versions[1].id } });
    expect(v2.find((r) => r.studentId === s3)!.rank).toBe(1);
  });
});
