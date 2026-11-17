"use server";

import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface MarkImportRow {
  admissionNumber?: string;
  subject?: string;
  component?: string;
  marks?: string;
  status?: string;
}

export interface MarkRowResult {
  index: number;
  data: MarkImportRow;
  errors: string[];
  studentId?: string;
  subjectId?: string;
  componentId?: string;
  parsedMarks?: number | null;
  parsedStatus?: string;
}

export interface MarkImportPreview {
  rows: MarkRowResult[];
  summary: { total: number; valid: number; invalid: number };
  error?: string;
}

export async function previewMarkImport(
  planId: string,
  rows: MarkImportRow[],
): Promise<MarkImportPreview> {
  const ctx = await requireUser();
  if (!rows.length) return { rows: [], summary: { total: 0, valid: 0, invalid: 0 } };
  if (rows.length > 2000)
    return { rows: [], summary: { total: rows.length, valid: 0, invalid: 0 }, error: "Max 2000 rows per import." };

  const plan = await prisma.assessmentPlan.findFirst({
    where: { id: planId, tenantId: ctx.tenantId! },
    include: {
      components: true,
      subjects: { include: { subject: true } },
      marks: { select: { studentId: true, subjectId: true, componentId: true } },
      section: { include: { enrollments: { where: { status: "ACTIVE" }, include: { student: { include: { person: true } } } } } },
    },
  });
  if (!plan) return { rows: [], summary: { total: 0, valid: 0, invalid: 0 }, error: "Assessment plan not found." };
  if (!canForCampus(ctx, "exams.enter", plan.campusId))
    return { rows: [], summary: { total: 0, valid: 0, invalid: 0 }, error: "You need exams.enter permission for this campus." };

  const studentByAdm = new Map(
    plan.section.enrollments.map((e) => [e.student.admissionNumber.toLowerCase(), e.student.id]),
  );
  const subjectByCode = new Map(plan.subjects.map((ps) => [ps.subject.code.toLowerCase(), ps.subjectId]));
  const subjectByName = new Map(plan.subjects.map((ps) => [ps.subject.name.toLowerCase(), ps.subjectId]));
  const componentByName = new Map(plan.components.map((c) => [c.name.toLowerCase(), c.id]));

  const VALID_STATUSES = ["NORMAL", "ABSENT", "EXEMPT"];

  const results: MarkRowResult[] = rows.map((data, index) => {
    const errors: string[] = [];
    if (!data.admissionNumber?.trim()) errors.push("Admission number required");
    if (!data.subject?.trim()) errors.push("Subject required");
    if (!data.component?.trim()) errors.push("Component required");

    const studentId = data.admissionNumber
      ? studentByAdm.get(data.admissionNumber.trim().toLowerCase())
      : undefined;
    if (data.admissionNumber && !studentId) errors.push(`Student "${data.admissionNumber}" not in this section`);

    const subjectKey = data.subject?.trim().toLowerCase() ?? "";
    const subjectId = subjectByCode.get(subjectKey) ?? subjectByName.get(subjectKey);
    if (data.subject && !subjectId) errors.push(`Subject "${data.subject}" not in this plan`);

    const componentId = data.component
      ? componentByName.get(data.component.trim().toLowerCase())
      : undefined;
    if (data.component && !componentId) errors.push(`Component "${data.component}" not in this plan`);

    const rawMarks = data.marks?.trim();
    let parsedMarks: number | null = null;
    if (rawMarks && rawMarks !== "") {
      const n = Number(rawMarks);
      if (!Number.isFinite(n) || n < 0) errors.push(`Invalid marks value "${rawMarks}"`);
      else parsedMarks = n;
    }

    const rawStatus = (data.status?.trim().toUpperCase() || "NORMAL") as string;
    if (!VALID_STATUSES.includes(rawStatus)) errors.push(`Invalid status "${data.status}" — use NORMAL, ABSENT, or EXEMPT`);

    return { index, data, errors, studentId, subjectId, componentId, parsedMarks, parsedStatus: rawStatus };
  });

  const valid = results.filter((r) => r.errors.length === 0).length;
  return { rows: results, summary: { total: rows.length, valid, invalid: rows.length - valid } };
}

export async function commitMarkImport(
  planId: string,
  rows: MarkImportRow[],
): Promise<{ ok: boolean; committed: number; error?: string }> {
  const ctx = await requireUser();
  const preview = await previewMarkImport(planId, rows);
  if (preview.error) return { ok: false, committed: 0, error: preview.error };

  const valid = preview.rows.filter((r) => r.errors.length === 0);
  if (!valid.length) return { ok: false, committed: 0, error: "No valid rows to import." };

  const plan = await prisma.assessmentPlan.findFirst({
    where: { id: planId, tenantId: ctx.tenantId! },
  });
  if (!plan) return { ok: false, committed: 0, error: "Plan not found." };

  await prisma.$transaction(
    valid.map((r) =>
      prisma.markEntry.upsert({
        where: {
          studentId_subjectId_componentId: {
            studentId: r.studentId!,
            subjectId: r.subjectId!,
            componentId: r.componentId!,
          },
        },
        create: {
          tenantId: ctx.tenantId!,
          planId,
          studentId: r.studentId!,
          subjectId: r.subjectId!,
          componentId: r.componentId!,
          marks: r.parsedMarks ?? null,
          status: r.parsedStatus as "NORMAL" | "ABSENT" | "EXEMPT",
          enteredByUserId: ctx.user.id,
        },
        update: {
          marks: r.parsedMarks ?? null,
          status: r.parsedStatus as "NORMAL" | "ABSENT" | "EXEMPT",
          enteredByUserId: ctx.user.id,
        },
      })
    )
  );

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "marks.import",
    targetType: "AssessmentPlan",
    targetId: planId,
    campusId: plan.campusId,
    scopeType: "CAMPUS",
    metadata: { count: valid.length },
  });

  return { ok: true, committed: valid.length };
}
