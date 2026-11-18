"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canForCampus, requireUser } from "@/lib/rbac";
import { parseComponents } from "@/lib/assessment-plan";

export interface PlanState {
  ok?: boolean;
  error?: string;
  message?: string;
  planId?: string;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// EXM-001: create an assessment plan with weighted components, subjects and
// (optionally) the teacher who owns each subject's marks.
export async function createAssessmentPlan(_p: PlanState, f: FormData): Promise<PlanState> {
  const ctx = await requireUser();
  const sectionId = str(f, "sectionId");
  const section = ctx.tenantId ? await prisma.section.findFirst({ where: { id: sectionId, tenantId: ctx.tenantId }, include: { academicYear: true, gradeLevel: true } }) : null;
  if (!section || !canForCampus(ctx, "exams.manage", section.campusId)) return { error: "You do not have permission to create assessment plans for this section." };
  const tenantId = ctx.tenantId!;

  const name = str(f, "name");
  if (!name) return { error: "Give the plan a name." };
  const [term, scale] = await Promise.all([
    prisma.term.findFirst({ where: { id: str(f, "termId"), tenantId, academicYearId: section.academicYearId } }),
    prisma.gradeScale.findFirst({ where: { id: str(f, "gradeScaleId"), tenantId } }),
  ]);
  if (!term) return { error: `Choose a term of ${section.academicYear.name} (the section's academic year).` };
  if (!scale) return { error: "Choose a grade scale." };

  const parsed = parseComponents(String(f.get("components") ?? ""));
  if (parsed.error) return { error: parsed.error };

  const subjectIds = [...f.keys()].filter((k) => k.startsWith("subject:") && f.get(k) === "on").map((k) => k.slice(8));
  if (subjectIds.length === 0) return { error: "Choose at least one subject." };
  const subjects = await prisma.subject.findMany({ where: { id: { in: subjectIds }, tenantId } });
  if (subjects.length !== subjectIds.length) return { error: "One of the chosen subjects does not exist." };

  const teachers = new Map<string, string | null>();
  for (const id of subjectIds) {
    const staffId = str(f, `teacher:${id}`) || null;
    if (staffId && !(await prisma.employmentRecord.findFirst({ where: { staffId, campusId: section.campusId, endDate: null } })))
      return { error: "A chosen teacher is not current staff on this campus." };
    teachers.set(id, staffId);
  }

  if (await prisma.assessmentPlan.findFirst({ where: { sectionId, termId: term.id, name: { equals: name, mode: "insensitive" } } }))
    return { error: "This section already has a plan with that name for the term." };

  const plan = await prisma.assessmentPlan.create({
    data: {
      tenantId,
      campusId: section.campusId,
      sectionId,
      termId: term.id,
      name,
      gradeScaleId: scale.id,
      components: { create: parsed.components!.map((c) => ({ tenantId, ...c })) },
      subjects: { create: subjectIds.map((subjectId) => ({ tenantId, subjectId, teacherStaffId: teachers.get(subjectId) ?? null })) },
    },
  });
  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "exams.plan.created",
    targetType: "AssessmentPlan",
    targetId: plan.id,
    campusId: section.campusId,
    scopeType: "CAMPUS",
    metadata: { name, components: parsed.components!.length, subjects: subjectIds.length },
  });
  revalidatePath("/portal/exams");
  return { ok: true, planId: plan.id, message: `Plan “${name}” created.` };
}

// Only a plan nobody has touched can be removed.
export async function deleteAssessmentPlan(_p: PlanState, f: FormData): Promise<PlanState> {
  const ctx = await requireUser();
  const plan = ctx.tenantId ? await prisma.assessmentPlan.findFirst({ where: { id: str(f, "id"), tenantId: ctx.tenantId } }) : null;
  if (!plan || !canForCampus(ctx, "exams.manage", plan.campusId)) return { error: "You do not have permission to delete this plan." };
  const [marks, versions] = await Promise.all([prisma.markEntry.count({ where: { planId: plan.id } }), prisma.resultVersion.count({ where: { planId: plan.id } })]);
  if (plan.status !== "OPEN" || marks || versions) return { error: "This plan has marks or published results. It cannot be deleted." };
  await prisma.assessmentPlan.delete({ where: { id: plan.id } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "exams.plan.deleted", targetType: "AssessmentPlan", targetId: plan.id, campusId: plan.campusId, scopeType: "CAMPUS", metadata: { name: plan.name } });
  revalidatePath("/portal/exams");
  return { ok: true, message: "Plan deleted." };
}
