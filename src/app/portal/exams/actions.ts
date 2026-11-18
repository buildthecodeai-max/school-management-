"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { computePlanResults } from "@/lib/exams-server";
import { canTransition, type PlanStatus } from "@/lib/exams";

async function planForUser(planId: string, tenantId: string) {
  const plan = await prisma.assessmentPlan.findFirst({
    where: { id: planId, tenantId },
    include: { subjects: true, components: true },
  });
  return plan;
}

async function currentStaffId(personId: string | null | undefined) {
  if (!personId) return null;
  const staff = await prisma.staff.findUnique({ where: { personId } });
  return staff?.id ?? null;
}

// ---- marks entry (EXM-003) ------------------------------------------------

export interface ExamActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export async function saveMarks(_prev: ExamActionState, formData: FormData): Promise<ExamActionState> {
  const ctx = await requireUser();
  const planId = String(formData.get("planId"));
  const subjectId = String(formData.get("subjectId"));
  const submit = String(formData.get("submit") || "save");
  let entries: { studentId: string; componentId: string; marks: string; status: string }[];
  try {
    entries = JSON.parse(String(formData.get("entries") || "[]"));
    if (!Array.isArray(entries)) throw new Error();
  } catch {
    return { error: "Could not read the marks grid." };
  }

  const plan = await planForUser(planId, ctx.tenantId!);
  if (!plan) return { error: "Plan not found" };
  if (plan.status !== "OPEN") return { error: "Marks entry is closed. Ask an approver to reopen the plan." };

  const planSubject = plan.subjects.find((s) => s.subjectId === subjectId);
  if (!planSubject) return { error: "Subject not in this plan" };

  const canManage = canForCampus(ctx, "exams.manage", plan.campusId);
  const canEnter = canForCampus(ctx, "exams.enter", plan.campusId);
  const myStaffId = await currentStaffId(ctx.user.personId);
  const isAssignedTeacher =
    !planSubject.teacherStaffId || planSubject.teacherStaffId === myStaffId;
  if (!(canManage || (canEnter && isAssignedTeacher))) {
    await audit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.user.id,
      action: "exams.marks.save",
      outcome: "DENIED",
      campusId: plan.campusId,
      scopeType: "CAMPUS",
      metadata: { planId, subjectId },
    });
    return { error: "You are not assigned to enter marks for this subject." };
  }

  // Validate the whole grid before writing anything: every row must be a student
  // enrolled in this plan's section and a component of this plan.
  const enrolled = await prisma.enrollment.findMany({
    where: { tenantId: ctx.tenantId!, sectionId: plan.sectionId, status: "ACTIVE" },
    select: { studentId: true },
  });
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));
  const compById = new Map(plan.components.map((c) => [c.id, c]));
  const rows: { studentId: string; componentId: string; marks: number | null; status: "NORMAL" | "ABSENT" | "EXEMPT" }[] = [];
  for (const e of entries) {
    const comp = compById.get(e.componentId);
    if (!comp) return { error: "The grid includes a component that is not part of this plan." };
    if (!enrolledIds.has(e.studentId)) return { error: "The grid includes a student who is not in this section." };
    const status = e.status === "ABSENT" || e.status === "EXEMPT" ? e.status : "NORMAL";
    let marks: number | null = null;
    if (status === "NORMAL" && e.marks !== "" && e.marks != null) {
      marks = Number(e.marks);
      if (!Number.isFinite(marks)) return { error: "Marks must be numeric." };
      if (marks < 0 || marks > comp.maxMarks)
        return { error: `Marks for "${comp.name}" must be between 0 and ${comp.maxMarks}.` };
    }
    rows.push({ studentId: e.studentId, componentId: e.componentId, marks, status });
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.markEntry.upsert({
        where: { studentId_subjectId_componentId: { studentId: r.studentId, subjectId, componentId: r.componentId } },
        create: { tenantId: ctx.tenantId!, planId, subjectId, enteredByUserId: ctx.user.id, ...r },
        update: { marks: r.marks, status: r.status, enteredByUserId: ctx.user.id },
      }),
    ),
  );

  if (submit === "submit") {
    // Submitting hands the whole plan to the approver, so it must be complete.
    const data = await computePlanResults(ctx.tenantId!, planId);
    if (!data || data.missing > 0)
      return { error: `Marks saved, but the plan cannot be submitted: ${data?.missing ?? "some"} mark(s) are still missing across subjects.` };
    await prisma.assessmentPlan.update({ where: { id: planId }, data: { status: "SUBMITTED" } });
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: submit === "submit" ? "exams.marks.submit" : "exams.marks.save",
    targetType: "AssessmentPlan",
    targetId: planId,
    campusId: plan.campusId,
    scopeType: "CAMPUS",
    metadata: { subjectId, count: rows.length },
  });

  revalidatePath(`/portal/exams/${planId}`);
  return { ok: true, message: submit === "submit" ? "Marks saved and plan submitted for approval." : "Marks saved." };
}

// ---- moderation / approval ------------------------------------------------

export async function setPlanStatus(_prev: ExamActionState, formData: FormData): Promise<ExamActionState> {
  const ctx = await requireUser();
  const planId = String(formData.get("planId"));
  const to = String(formData.get("status"));
  const reason = String(formData.get("reason") || "").trim();
  const plan = await planForUser(planId, ctx.tenantId!);
  if (!plan) return { error: "Plan not found" };

  const from = plan.status as PlanStatus;
  if (!canTransition(from, to)) return { error: `A plan cannot move from ${from} to ${to}.` };

  // Submitting is an entry action; approve/reopen are approver actions.
  const perm = to === "SUBMITTED" ? "exams.enter" : "exams.approve";
  if (!canForCampus(ctx, perm, plan.campusId) && !canForCampus(ctx, "exams.manage", plan.campusId))
    return { error: "You do not have rights for this action." };

  if (to === "SUBMITTED" || to === "APPROVED") {
    const data = await computePlanResults(ctx.tenantId!, planId);
    if (!data || data.missing > 0) return { error: `${data?.missing ?? "Some"} mark(s) are still missing.` };
  }
  if (to === "APPROVED") {
    // Maker-checker: whoever entered marks cannot approve them.
    const own = await prisma.markEntry.count({ where: { planId, enteredByUserId: ctx.user.id } });
    if (own > 0) return { error: "You entered marks on this plan, so someone else must approve it." };
  }
  if (to === "OPEN" && reason.length < 5) return { error: "Give a reason (at least 5 characters) for reopening." };

  await prisma.assessmentPlan.update({
    where: { id: planId },
    data: {
      status: to,
      approvedByUserId: to === "APPROVED" ? ctx.user.id : to === "OPEN" ? null : plan.approvedByUserId,
    },
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "exams.plan.status",
    targetType: "AssessmentPlan",
    targetId: planId,
    campusId: plan.campusId,
    scopeType: "CAMPUS",
    metadata: { from, to, ...(reason ? { reason } : {}) },
  });
  revalidatePath(`/portal/exams/${planId}`);
  return { ok: true, message: `Plan is now ${to.toLowerCase()}.` };
}

// ---- publish (EXM-004/006) ------------------------------------------------

export async function publishResults(_prev: ExamActionState, formData: FormData): Promise<ExamActionState> {
  const ctx = await requireUser();
  const planId = String(formData.get("planId"));
  const reason = String(formData.get("reason") || "");
  const plan = await planForUser(planId, ctx.tenantId!);
  if (!plan) return { error: "Plan not found" };
  if (!canForCampus(ctx, "exams.approve", plan.campusId))
    return { error: "Publishing requires approval rights." };
  // PUBLISHED plans must be reopened, corrected and re-approved before a new version.
  if (plan.status !== "APPROVED") return { error: "Results must be approved before publishing." };

  const data = await computePlanResults(ctx.tenantId!, planId);
  if (!data) return { error: "Could not compute results." };
  if (data.students.length === 0) return { error: "No students are enrolled in this section." };
  // Publication gate (EXM-004): block when marks are incomplete.
  if (data.missing > 0) return { error: `Cannot publish: ${data.missing} mark(s) still missing.` };

  const last = await prisma.resultVersion.findFirst({
    where: { planId },
    orderBy: { version: "desc" },
  });
  const version = (last?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    // Supersede prior versions (corrections keep the old ones auditable).
    await tx.resultVersion.updateMany({
      where: { planId, status: "PUBLISHED" },
      data: { status: "SUPERSEDED" },
    });
    const rv = await tx.resultVersion.create({
      data: {
        tenantId: ctx.tenantId!,
        planId,
        version,
        status: "PUBLISHED",
        reason: reason || null,
        publishedByUserId: ctx.user.id,
      },
    });
    for (const r of data.computed) {
      await tx.studentResult.create({
        data: {
          tenantId: ctx.tenantId!,
          resultVersionId: rv.id,
          studentId: r.studentId,
          overallPercent: r.overallPercent,
          overallGrade: r.overallGrade,
          rank: r.rank,
          passed: r.passed,
          lines: {
            create: r.lines.map((l) => ({
              tenantId: ctx.tenantId!,
              subjectId: l.subjectId,
              subjectName: l.subjectName,
              percent: l.percent,
              grade: l.grade,
            })),
          },
        },
      });
    }
    await tx.assessmentPlan.update({ where: { id: planId }, data: { status: "PUBLISHED" } });
  });

  // Notify guardians that results are published.
  const guardians = await prisma.guardianRelationship.findMany({
    where: {
      tenantId: ctx.tenantId!,
      receivesNotifications: true,
      student: { enrollments: { some: { sectionId: plan.sectionId, status: "ACTIVE" } } },
    },
    include: { guardian: { include: { person: { include: { user: true } } } }, student: { include: { person: true } } },
  });
  for (const g of guardians) {
    const u = g.guardian.person.user;
    if (!u) continue;
    await notify({
      tenantId: ctx.tenantId!,
      recipientUserId: u.id,
      category: "ACADEMICS",
      title: "Report card published",
      body: `${g.student.person.firstName}'s ${plan.name} report card is now available in the portal.`,
      relatedType: "exams",
      relatedId: planId,
      // Distinct per version so a republish (correction) re-notifies.
      dedupeKey: `exams:${planId}:v${version}:${g.studentId}`,
    });
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "exams.publish",
    targetType: "AssessmentPlan",
    targetId: planId,
    campusId: plan.campusId,
    scopeType: "CAMPUS",
    metadata: { version, reason },
  });

  revalidatePath(`/portal/exams/${planId}`);
  return { ok: true, message: `Results published (version ${version}). Guardians have been notified.` };
}
