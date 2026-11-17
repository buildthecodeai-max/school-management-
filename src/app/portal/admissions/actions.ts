"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus, assertPermission } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { emitWebhook } from "@/lib/webhooks";
import { hashPassword } from "@/lib/auth";
import { PIPELINE_STAGES, nextStage } from "@/lib/admissions";
import { nextAdmissionNumber } from "@/lib/admissions-server";
import { assertWithinLimit } from "@/lib/entitlements";
import type { ApplicationStage, Prisma } from "@prisma/client";

// ---- helpers --------------------------------------------------------------

async function loadApp(id: string, tenantId: string) {
  return prisma.application.findFirst({
    where: { id, tenantId },
    include: { checklist: true, offers: { orderBy: { version: "desc" } } },
  });
}

async function recordStage(
  tx: Prisma.TransactionClient | typeof prisma,
  app: { id: string; tenantId: string; stage: ApplicationStage },
  to: ApplicationStage,
  actorUserId: string,
  reason?: string,
) {
  await tx.applicationStageEvent.create({
    data: {
      tenantId: app.tenantId,
      applicationId: app.id,
      fromStage: app.stage,
      toStage: to,
      actorUserId,
      reason,
    },
  });
}

// ---- create ---------------------------------------------------------------

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).optional(),
  campusId: z.string().min(1),
  gradeLevelId: z.string().optional(),
  source: z.enum(["WEBSITE", "WALK_IN", "REFERRAL", "STAFF", "API"]),
  priorSchool: z.string().optional(),
  guardianName: z.string().optional(),
  guardianEmail: z.string().email().optional().or(z.literal("")),
  guardianPhone: z.string().optional(),
  guardianRelationship: z
    .enum(["MOTHER", "FATHER", "GUARDIAN", "GRANDPARENT", "SIBLING", "OTHER"])
    .optional(),
  applicantEmail: z.string().email().optional().or(z.literal("")),
  applicantPhone: z.string().optional(),
  notes: z.string().optional(),
});

const DEFAULT_CHECKLIST: { label: string; type: "DOCUMENT" | "PAYMENT" | "FORM" | "CONSENT" }[] = [
  { label: "Birth certificate", type: "DOCUMENT" },
  { label: "Previous school report", type: "DOCUMENT" },
  { label: "Application fee", type: "PAYMENT" },
  { label: "Guardian consent", type: "CONSENT" },
];

export async function createApplication(formData: FormData) {
  const ctx = await requireUser();
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const d = parsed.data;

  assertPermission(ctx, "admissions.write");
  if (!canForCampus(ctx, "admissions.write", d.campusId)) {
    throw new Error("You cannot create applications for this campus.");
  }

  const person = await prisma.person.create({
    data: {
      tenantId: ctx.tenantId!,
      firstName: d.firstName,
      lastName: d.lastName,
      dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
      gender: d.gender ?? "UNDISCLOSED",
      email: d.applicantEmail || null,
      phone: d.applicantPhone || null,
    },
  });

  const app = await prisma.application.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId: d.campusId,
      applicantPersonId: person.id,
      gradeLevelId: d.gradeLevelId || null,
      source: d.source,
      stage: "APPLICATION",
      ownerUserId: ctx.user.id,
      priorSchool: d.priorSchool || null,
      notes: d.notes || null,
      guardianName: d.guardianName || null,
      guardianEmail: d.guardianEmail || null,
      guardianPhone: d.guardianPhone || null,
      guardianRelationship: d.guardianRelationship ?? null,
      consentGiven: false,
      checklist: {
        create: DEFAULT_CHECKLIST.map((c) => ({ ...c, tenantId: ctx.tenantId! })),
      },
    },
  });
  await recordStage(prisma, { ...app, stage: "INQUIRY" }, "APPLICATION", ctx.user.id, "Application created");
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "admissions.create",
    targetType: "Application",
    targetId: app.id,
    campusId: d.campusId,
    scopeType: "CAMPUS",
  });

  redirect(`/portal/admissions/${app.id}`);
}

// ---- stage transitions ----------------------------------------------------

export async function advanceStage(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const app = await loadApp(id, ctx.tenantId!);
  if (!app) throw new Error("Application not found");
  if (!canForCampus(ctx, "admissions.write", app.campusId))
    throw new Error("Forbidden");

  const to = nextStage(app.stage);
  if (!to) throw new Error("No further pipeline stage");

  // Guardrail (ADM-002): required checklist must be complete to move past
  // APPLICATION into REVIEW or later.
  const movingIntoReviewOrLater =
    PIPELINE_STAGES.indexOf(to) >= PIPELINE_STAGES.indexOf("REVIEW");
  if (movingIntoReviewOrLater) {
    const incomplete = app.checklist.filter((c) => c.required && !c.completed);
    if (incomplete.length > 0) {
      throw new Error(
        `Cannot advance: ${incomplete.length} required checklist item(s) incomplete.`,
      );
    }
  }
  // Offer stage is entered by issuing an offer, not by plain advance.
  if (to === "OFFER") {
    throw new Error("Issue an offer to advance to the Offer stage.");
  }
  if (to === "ENROLLED") {
    throw new Error("Use Convert to enrolled to complete admission.");
  }

  await prisma.$transaction(async (tx) => {
    await recordStage(tx, app, to, ctx.user.id);
    await tx.application.update({ where: { id: app.id }, data: { stage: to } });
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "admissions.advance",
    targetType: "Application",
    targetId: app.id,
    campusId: app.campusId,
    scopeType: "CAMPUS",
    metadata: { to },
  });
  revalidatePath(`/portal/admissions/${app.id}`);
}

export async function setSideStage(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const to = String(formData.get("stage")) as ApplicationStage;
  const reason = String(formData.get("reason") || "");
  const app = await loadApp(id, ctx.tenantId!);
  if (!app) throw new Error("Application not found");

  // Rejection / waitlist are decisions; withdrawal is a plain edit.
  const perm = to === "WITHDRAWN" ? "admissions.write" : "admissions.decide";
  if (!canForCampus(ctx, perm, app.campusId)) throw new Error("Forbidden");

  await prisma.$transaction(async (tx) => {
    await recordStage(tx, app, to, ctx.user.id, reason);
    await tx.application.update({ where: { id: app.id }, data: { stage: to } });
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "admissions.decision",
    targetType: "Application",
    targetId: app.id,
    campusId: app.campusId,
    scopeType: "CAMPUS",
    metadata: { to, reason },
  });
  revalidatePath(`/portal/admissions/${app.id}`);
}

// ---- checklist ------------------------------------------------------------

export async function toggleChecklistItem(formData: FormData) {
  const ctx = await requireUser();
  const itemId = String(formData.get("itemId"));
  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, tenantId: ctx.tenantId! },
    include: { application: true },
  });
  if (!item) throw new Error("Item not found");
  if (!canForCampus(ctx, "admissions.write", item.application.campusId))
    throw new Error("Forbidden");

  await prisma.checklistItem.update({
    where: { id: item.id },
    data: {
      completed: !item.completed,
      completedAt: !item.completed ? new Date() : null,
    },
  });
  revalidatePath(`/portal/admissions/${item.applicationId}`);
}

// ---- interviews & assessments --------------------------------------------

export async function scheduleInterview(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const when = String(formData.get("scheduledAt"));
  const app = await loadApp(id, ctx.tenantId!);
  if (!app) throw new Error("Application not found");
  if (!canForCampus(ctx, "admissions.write", app.campusId))
    throw new Error("Forbidden");
  if (!when) throw new Error("Pick a date and time");

  await prisma.interview.create({
    data: {
      tenantId: ctx.tenantId!,
      applicationId: id,
      scheduledAt: new Date(when),
      interviewerUserId: ctx.user.id,
      status: "SCHEDULED",
    },
  });
  revalidatePath(`/portal/admissions/${id}`);
}

export async function recordAssessment(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const name = String(formData.get("name") || "Assessment");
  const score = formData.get("score") ? Number(formData.get("score")) : null;
  const maxScore = formData.get("maxScore") ? Number(formData.get("maxScore")) : null;
  const notes = String(formData.get("notes") || "");
  const app = await loadApp(id, ctx.tenantId!);
  if (!app) throw new Error("Application not found");
  if (!canForCampus(ctx, "admissions.write", app.campusId))
    throw new Error("Forbidden");

  await prisma.admissionAssessment.create({
    data: {
      tenantId: ctx.tenantId!,
      applicationId: id,
      name,
      score,
      maxScore,
      notes: notes || null,
    },
  });
  revalidatePath(`/portal/admissions/${id}`);
}

// ---- offers ---------------------------------------------------------------

export async function issueOffer(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const deposit = formData.get("depositAmount")
    ? Math.round(Number(formData.get("depositAmount")) * 100)
    : 0;
  const deadline = formData.get("deadline")
    ? new Date(String(formData.get("deadline")))
    : null;
  const terms = String(formData.get("terms") || "");

  const app = await loadApp(id, ctx.tenantId!);
  if (!app) throw new Error("Application not found");
  if (!canForCampus(ctx, "admissions.decide", app.campusId))
    throw new Error("Issuing an offer requires decision approval rights.");

  const latestVersion = app.offers[0]?.version ?? 0;

  await prisma.$transaction(async (tx) => {
    // Supersede any outstanding offer.
    await tx.offer.updateMany({
      where: { applicationId: id, status: "ISSUED" },
      data: { status: "WITHDRAWN", respondedAt: new Date() },
    });
    await tx.offer.create({
      data: {
        tenantId: ctx.tenantId!,
        applicationId: id,
        version: latestVersion + 1,
        status: "ISSUED",
        depositAmount: deposit,
        deadline,
        terms: terms || null,
        approvedByUserId: ctx.user.id,
      },
    });
    if (app.stage !== "OFFER") {
      await recordStage(tx, app, "OFFER", ctx.user.id, "Offer issued");
      await tx.application.update({ where: { id }, data: { stage: "OFFER" } });
    }
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "admissions.offer.issue",
    targetType: "Application",
    targetId: id,
    campusId: app.campusId,
    scopeType: "CAMPUS",
    metadata: { version: latestVersion + 1, deposit },
  });
  revalidatePath(`/portal/admissions/${id}`);
}

export async function respondOffer(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const accept = String(formData.get("response")) === "accept";
  const app = await loadApp(id, ctx.tenantId!);
  if (!app) throw new Error("Application not found");
  if (!canForCampus(ctx, "admissions.write", app.campusId))
    throw new Error("Forbidden");

  const offer = app.offers.find((o) => o.status === "ISSUED");
  if (!offer) throw new Error("No outstanding offer");

  await prisma.$transaction(async (tx) => {
    await tx.offer.update({
      where: { id: offer.id },
      data: {
        status: accept ? "ACCEPTED" : "DECLINED",
        depositPaid: accept,
        respondedAt: new Date(),
      },
    });
    const to: ApplicationStage = accept ? "ACCEPTED" : "WITHDRAWN";
    await recordStage(tx, app, to, ctx.user.id, accept ? "Offer accepted" : "Offer declined");
    await tx.application.update({ where: { id }, data: { stage: to } });
  });
  revalidatePath(`/portal/admissions/${id}`);
}

// ---- conversion (ADM-005) -------------------------------------------------

export async function convertToEnrolled(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const app = await prisma.application.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: { applicant: true, conversion: true },
  });
  if (!app) throw new Error("Application not found");
  if (!canForCampus(ctx, "admissions.convert", app.campusId))
    throw new Error("Converting requires conversion rights.");
  if (app.stage !== "ACCEPTED")
    throw new Error("Only accepted applicants can be converted.");
  if (app.conversion) throw new Error("Already converted.");
  if (!app.gradeLevelId)
    throw new Error("Set a target grade before converting.");

  const year = await prisma.academicYear.findFirst({
    where: { campusId: app.campusId, isCurrent: true },
  });
  if (!year) throw new Error("No current academic year for this campus.");

  const sectionIdParam = String(formData.get("sectionId") || "").trim();
  const sections = await prisma.section.findMany({
    where: { campusId: app.campusId, gradeLevelId: app.gradeLevelId, academicYearId: year.id },
    include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
  });
  if (sections.length === 0)
    throw new Error("No section exists for the target grade. Create one first.");
  let section = sections.find((s) => s._count.enrollments < s.capacity) ?? sections[0];
  if (sectionIdParam) {
    const picked = sections.find((s) => s.id === sectionIdParam);
    if (!picked) throw new Error("Selected class not found for this grade and academic year.");
    section = picked;
  }

  // BIL-002: Enforce per-plan student limit before creating the enrollment.
  await assertWithinLimit(ctx.tenantId!, "students");

  const admissionNumber = await nextAdmissionNumber(ctx.tenantId!);
  const lastRoll = await prisma.enrollment.aggregate({
    where: { sectionId: section.id },
    _max: { rollNumber: true },
  });

  // Prepare guardian portal user (created only if email is free).
  const guardianEmail = app.guardianEmail?.toLowerCase().trim() || null;
  let guardianUserPassword: string | null = null;
  let emailFree = false;
  if (guardianEmail) {
    const existing = await prisma.user.findUnique({ where: { email: guardianEmail } });
    emailFree = !existing;
    if (emailFree) guardianUserPassword = await hashPassword("password123");
  }
  const parentRole = await prisma.role.findFirst({
    where: { tenantId: ctx.tenantId!, name: "Parent / Guardian" },
  });

  const result = await prisma.$transaction(async (tx) => {
    // Reuse the applicant Person as the student identity (no rekeying).
    const student = await tx.student.create({
      data: {
        tenantId: ctx.tenantId!,
        personId: app.applicantPersonId,
        admissionNumber,
        status: "ENROLLED",
      },
    });
    const enrollment = await tx.enrollment.create({
      data: {
        tenantId: ctx.tenantId!,
        studentId: student.id,
        campusId: app.campusId,
        academicYearId: year.id,
        gradeLevelId: app.gradeLevelId!,
        sectionId: section.id,
        rollNumber: (lastRoll._max.rollNumber ?? 0) + 1,
        status: "ACTIVE",
      },
    });

    let guardianId: string | null = null;
    let guardianUserId: string | null = null;
    if (app.guardianName) {
      const [gfirst, ...grest] = app.guardianName.trim().split(" ");
      const guardianPerson = await tx.person.create({
        data: {
          tenantId: ctx.tenantId!,
          firstName: gfirst,
          lastName: grest.join(" ") || app.applicant.lastName,
          email: app.guardianEmail || null,
          phone: app.guardianPhone || null,
        },
      });
      const guardian = await tx.guardian.create({
        data: { tenantId: ctx.tenantId!, personId: guardianPerson.id },
      });
      guardianId = guardian.id;
      await tx.guardianRelationship.create({
        data: {
          tenantId: ctx.tenantId!,
          guardianId: guardian.id,
          studentId: student.id,
          relationship: app.guardianRelationship ?? "GUARDIAN",
          isPrimaryContact: true,
          financiallyResponsible: true,
          receivesNotifications: true,
        },
      });
      // Provision portal access (ADM-005) if the email is available.
      if (guardianEmail && emailFree && guardianUserPassword) {
        const gUser = await tx.user.create({
          data: {
            tenantId: ctx.tenantId!,
            personId: guardianPerson.id,
            email: guardianEmail,
            passwordHash: guardianUserPassword,
            displayName: app.guardianName,
            status: "ACTIVE",
          },
        });
        guardianUserId = gUser.id;
        if (parentRole) {
          await tx.roleAssignment.create({
            data: { userId: gUser.id, roleId: parentRole.id, scopeType: "ORG" },
          });
        }
      }
    }

    await tx.enrollmentConversion.create({
      data: {
        tenantId: ctx.tenantId!,
        applicationId: id,
        studentId: student.id,
        enrollmentId: enrollment.id,
        guardianId,
        guardianUserId,
        convertedByUserId: ctx.user.id,
      },
    });
    await recordStage(tx, app, "ENROLLED", ctx.user.id, "Converted to enrolled student");
    await tx.application.update({ where: { id }, data: { stage: "ENROLLED" } });

    return { studentId: student.id, guardianUserId };
  });

  // Onboarding notice to the new guardian portal account (workflow step 7).
  if (result.guardianUserId) {
    await notify({
      tenantId: ctx.tenantId!,
      recipientUserId: result.guardianUserId,
      category: "ADMISSIONS",
      title: "Welcome to " + (ctx.user.tenant?.name ?? "the school"),
      body: `${app.applicant.firstName} is now enrolled. Your onboarding checklist is available in the portal.`,
      relatedType: "admissions",
      relatedId: id,
      dedupeKey: `admissions:welcome:${id}`,
    });
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "admissions.convert",
    targetType: "Application",
    targetId: id,
    campusId: app.campusId,
    scopeType: "CAMPUS",
    metadata: { studentId: result.studentId, admissionNumber },
  });

  await emitWebhook(ctx.tenantId!, "student.enrolled", {
    studentId: result.studentId,
    admissionNumber,
    campusId: app.campusId,
    gradeLevelId: app.gradeLevelId,
    applicationId: id,
  });

  redirect(`/portal/students/${result.studentId}`);
}

// ---- delete application ---------------------------------------------------

export async function deleteApplication(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const app = await prisma.application.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: { conversion: true },
  });
  if (!app) throw new Error("Application not found");
  if (!canForCampus(ctx, "admissions.write", app.campusId)) throw new Error("Forbidden");
  if (app.conversion) throw new Error("Cannot delete a converted (enrolled) application.");

  await prisma.$transaction(async (tx) => {
    await tx.checklistItem.deleteMany({ where: { applicationId: id } });
    await tx.interview.deleteMany({ where: { applicationId: id } });
    await tx.admissionAssessment.deleteMany({ where: { applicationId: id } });
    await tx.offer.deleteMany({ where: { applicationId: id } });
    await tx.applicationStageEvent.deleteMany({ where: { applicationId: id } });
    await tx.application.delete({ where: { id } });
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "admissions.delete",
    targetType: "Application",
    targetId: id,
    campusId: app.campusId,
    scopeType: "CAMPUS",
  });

  redirect("/portal/admissions");
}

// ---- re-admission (new application for existing person) ------------------

export async function reAdmit(formData: FormData) {
  const ctx = await requireUser();
  const id = String(formData.get("applicationId"));
  const app = await prisma.application.findFirst({
    where: { id, tenantId: ctx.tenantId! },
  });
  if (!app) throw new Error("Application not found");
  if (!canForCampus(ctx, "admissions.write", app.campusId)) throw new Error("Forbidden");

  const newApp = await prisma.application.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId: app.campusId,
      applicantPersonId: app.applicantPersonId,
      gradeLevelId: app.gradeLevelId,
      source: app.source,
      stage: "APPLICATION",
      ownerUserId: ctx.user.id,
      priorSchool: app.priorSchool,
      notes: `Re-admission — previous application ${id}`,
      guardianName: app.guardianName,
      guardianEmail: app.guardianEmail,
      guardianPhone: app.guardianPhone,
      guardianRelationship: app.guardianRelationship,
      consentGiven: false,
      checklist: {
        create: DEFAULT_CHECKLIST.map((c) => ({ ...c, tenantId: ctx.tenantId! })),
      },
    },
  });

  await recordStage(
    prisma,
    { ...newApp, stage: "INQUIRY" as const },
    "APPLICATION",
    ctx.user.id,
    `Re-admission from application ${id}`,
  );

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "admissions.readmit",
    targetType: "Application",
    targetId: newApp.id,
    campusId: app.campusId,
    scopeType: "CAMPUS",
    metadata: { previousApplicationId: id },
  });

  redirect(`/portal/admissions/${newApp.id}`);
}
