"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { computePlanResults } from "@/lib/exams-server";

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

export async function saveMarks(formData: FormData) {
  const ctx = await requireUser();
  const planId = String(formData.get("planId"));
  const subjectId = String(formData.get("subjectId"));
  const submit = String(formData.get("submit") || "save");
  let entries: { studentId: string; componentId: string; marks: string; status: string }[];
  try {
    entries = JSON.parse(String(formData.get("entries") || "[]"));
  } catch {
    throw new Error("Could not read the marks grid.");
  }

  const plan = await planForUser(planId, ctx.tenantId!);
  if (!plan) throw new Error("Plan not found");
  if (plan.status !== "OPEN")
    throw new Error("Marks entry is closed. Ask an approver to reopen the plan.");

  const planSubject = plan.subjects.find((s) => s.subjectId === subjectId);
  if (!planSubject) throw new Error("Subject not in this plan");

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
    throw new Error("You are not assigned to enter marks for this subject.");
  }

  const compById = new Map(plan.components.map((c) => [c.id, c]));

  for (const e of entries) {
    const comp = compById.get(e.componentId);
    if (!comp) continue;
    let marks: number | null = null;
    const status = e.status === "ABSENT" || e.status === "EXEMPT" ? e.status : "NORMAL";
    if (status === "NORMAL" && e.marks !== "" && e.marks != null) {
      marks = Number(e.marks);
      if (!isFinite(marks)) throw new Error("Marks must be numeric.");
      if (marks < 0 || marks > comp.maxMarks)
        throw new Error(`Marks for "${comp.name}" must be between 0 and ${comp.maxMarks}.`);
    }
    await prisma.markEntry.upsert({
      where: {
        studentId_subjectId_componentId: {
          studentId: e.studentId,
          subjectId,
          componentId: e.componentId,
        },
      },
      create: {
        tenantId: ctx.tenantId!,
        planId,
        studentId: e.studentId,
        subjectId,
        componentId: e.componentId,
        marks,
        status: status as never,
        enteredByUserId: ctx.user.id,
      },
      update: { marks, status: status as never, enteredByUserId: ctx.user.id },
    });
  }

  if (submit === "submit") {
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
    metadata: { subjectId, count: entries.length },
  });

  revalidatePath(`/portal/exams/${planId}`);
}

// ---- moderation / approval ------------------------------------------------

export async function setPlanStatus(formData: FormData) {
  const ctx = await requireUser();
  const planId = String(formData.get("planId"));
  const to = String(formData.get("status"));
  const plan = await planForUser(planId, ctx.tenantId!);
  if (!plan) throw new Error("Plan not found");

  // Submitting is an entry action; approve/reopen are approver actions.
  const perm = to === "SUBMITTED" ? "exams.enter" : "exams.approve";
  if (!canForCampus(ctx, perm, plan.campusId) && !canForCampus(ctx, "exams.manage", plan.campusId))
    throw new Error("You do not have rights for this action.");

  await prisma.assessmentPlan.update({
    where: { id: planId },
    data: {
      status: to as never,
      approvedByUserId: to === "APPROVED" ? ctx.user.id : plan.approvedByUserId,
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
    metadata: { to },
  });
  revalidatePath(`/portal/exams/${planId}`);
}

// ---- publish (EXM-004/006) ------------------------------------------------

export async function publishResults(formData: FormData) {
  const ctx = await requireUser();
  const planId = String(formData.get("planId"));
  const reason = String(formData.get("reason") || "");
  const plan = await planForUser(planId, ctx.tenantId!);
  if (!plan) throw new Error("Plan not found");
  if (!canForCampus(ctx, "exams.approve", plan.campusId))
    throw new Error("Publishing requires approval rights.");
  if (plan.status !== "APPROVED" && plan.status !== "PUBLISHED")
    throw new Error("Results must be approved before publishing.");

  const data = await computePlanResults(ctx.tenantId!, planId);
  if (!data) throw new Error("Could not compute results.");
  // Publication gate (EXM-004): block when marks are incomplete.
  if (data.missing > 0)
    throw new Error(`Cannot publish: ${data.missing} mark(s) still missing.`);

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
}
