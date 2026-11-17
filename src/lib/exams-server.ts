import "server-only";
import { prisma } from "./db";
import { computeResults, type Mark, type Band } from "./exams";

export async function loadPlan(tenantId: string, planId: string) {
  return prisma.assessmentPlan.findFirst({
    where: { id: planId, tenantId },
    include: {
      section: { include: { gradeLevel: true, campus: true } },
      term: true,
      gradeScale: { include: { bands: true } },
      components: { orderBy: { name: "asc" } },
      subjects: { include: { subject: true } },
    },
  });
}

// Assemble everything needed to compute results for a plan, plus a
// completeness check that gates publication (EXM-004).
export async function computePlanResults(tenantId: string, planId: string) {
  const plan = await loadPlan(tenantId, planId);
  if (!plan) return null;

  const enrollments = await prisma.enrollment.findMany({
    where: { sectionId: plan.sectionId, status: "ACTIVE" },
    include: { student: { include: { person: true } } },
    orderBy: { rollNumber: "asc" },
  });
  const students = enrollments.map((e) => e.student);

  const marks = await prisma.markEntry.findMany({ where: { planId } });
  const marksBy = new Map<string, Mark[]>();
  for (const m of marks) {
    const key = `${m.studentId}:${m.subjectId}`;
    const list = marksBy.get(key) ?? [];
    list.push({ componentId: m.componentId, marks: m.marks, status: m.status });
    marksBy.set(key, list);
  }

  const bands: Band[] = plan.gradeScale.bands.map((b) => ({
    grade: b.grade,
    minPercent: b.minPercent,
    gradePoint: b.gradePoint,
    isPass: b.isPass,
  }));

  const computed = computeResults({
    bands,
    components: plan.components.map((c) => ({ id: c.id, weight: c.weight, maxMarks: c.maxMarks })),
    subjects: plan.subjects.map((ps) => ({ id: ps.subjectId, name: ps.subject.name })),
    students: students.map((s) => s.id),
    marksBy,
  });

  // Completeness: every student × subject × component needs a mark (a value,
  // or an explicit ABSENT/EXEMPT).
  const expected = students.length * plan.subjects.length * plan.components.length;
  let entered = 0;
  for (const s of students) {
    for (const ps of plan.subjects) {
      for (const c of plan.components) {
        const m = marks.find(
          (x) => x.studentId === s.id && x.subjectId === ps.subjectId && x.componentId === c.id,
        );
        if (m && (m.status !== "NORMAL" || m.marks !== null)) entered++;
      }
    }
  }
  const missing = expected - entered;

  return { plan, students, computed, missing, expected, entered };
}
