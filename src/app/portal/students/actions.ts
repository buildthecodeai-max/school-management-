"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { checkLimit } from "@/lib/entitlements";

export interface StudentActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// ADM-006: Transfer a student to another campus within the same tenant.
const transferSchema = z.object({
  studentId: z.string().min(1),
  fromCampusId: z.string().min(1),
  toCampusId: z.string().min(1),
  reason: z.string().min(1),
  effectiveDate: z.string().min(1),
});

export async function transferStudent(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const ctx = await requireUser();
  const parsed = transferSchema.safeParse({
    studentId: formData.get("studentId"),
    fromCampusId: formData.get("fromCampusId"),
    toCampusId: formData.get("toCampusId"),
    reason: formData.get("reason"),
    effectiveDate: formData.get("effectiveDate"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { studentId, fromCampusId, toCampusId, reason, effectiveDate } = parsed.data;

  if (!canForCampus(ctx, "student.write", fromCampusId))
    return { error: "Permission denied on source campus." };
  if (!canForCampus(ctx, "student.write", toCampusId))
    return { error: "Permission denied on destination campus." };

  const date = new Date(effectiveDate);

  await prisma.$transaction(async (tx) => {
    // Close the active enrollment on the source campus.
    await tx.enrollment.updateMany({
      where: { tenantId: ctx.tenantId!, studentId, campusId: fromCampusId, status: "ACTIVE" },
      data: { status: "TRANSFERRED_OUT", endDate: date },
    });
    // Find the current academic year on the destination campus.
    const destYear = await tx.academicYear.findFirst({
      where: { tenantId: ctx.tenantId!, campusId: toCampusId, isCurrent: true },
    });
    if (!destYear) throw new Error("Destination campus has no current academic year.");
    const destGrade = await tx.gradeLevel.findFirst({
      where: { tenantId: ctx.tenantId!, campusId: toCampusId },
      orderBy: { rank: "asc" },
    });
    if (!destGrade) throw new Error("Destination campus has no grade levels.");
    const destSection = await tx.section.findFirst({
      where: { tenantId: ctx.tenantId!, campusId: toCampusId, gradeLevelId: destGrade.id },
    });
    if (!destSection) throw new Error("Destination campus has no sections.");
    // Open a new TRANSFERRED_IN enrollment on the destination campus.
    await tx.enrollment.create({
      data: {
        tenantId: ctx.tenantId!,
        studentId,
        campusId: toCampusId,
        academicYearId: destYear.id,
        gradeLevelId: destGrade.id,
        sectionId: destSection.id,
        status: "TRANSFERRED_IN",
        startDate: date,
      },
    });
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.transferred",
    targetType: "Student",
    targetId: studentId,
    campusId: fromCampusId,
    metadata: { fromCampusId, toCampusId, reason },
  });

  revalidatePath(`/portal/students/${studentId}`);
  return { ok: true, message: "Student transferred." };
}

// ADM-006: Mark a student as an alumni.
const alumniSchema = z.object({
  studentId: z.string().min(1),
  campusId: z.string().min(1),
  reason: z.string().optional(),
});

export async function markAlumni(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const ctx = await requireUser();
  const parsed = alumniSchema.safeParse({
    studentId: formData.get("studentId"),
    campusId: formData.get("campusId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { studentId, campusId, reason } = parsed.data;
  if (!canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };

  await prisma.enrollment.updateMany({
    where: { tenantId: ctx.tenantId!, studentId, campusId, status: "ACTIVE" },
    data: { status: "ALUMNI", endDate: new Date() },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.alumni",
    targetType: "Student",
    targetId: studentId,
    campusId,
    metadata: { reason },
  });

  revalidatePath(`/portal/students/${studentId}`);
  return { ok: true, message: "Student marked as alumni." };
}

// ADM-006: Reenroll a student (creates a new ACTIVE enrollment from ALUMNI/WITHDRAWN).
const reenrollSchema = z.object({
  studentId: z.string().min(1),
  campusId: z.string().min(1),
  academicYearId: z.string().min(1),
  gradeLevelId: z.string().min(1),
  sectionId: z.string().min(1),
});

export async function reenrollStudent(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const ctx = await requireUser();
  const parsed = reenrollSchema.safeParse({
    studentId: formData.get("studentId"),
    campusId: formData.get("campusId"),
    academicYearId: formData.get("academicYearId"),
    gradeLevelId: formData.get("gradeLevelId"),
    sectionId: formData.get("sectionId"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { studentId, campusId, academicYearId, gradeLevelId, sectionId } = parsed.data;
  if (!canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };

  const existing = await prisma.enrollment.findFirst({
    where: { tenantId: ctx.tenantId!, studentId, campusId, status: "ACTIVE" },
  });
  if (existing) return { error: "Student already has an active enrollment." };

  const limitError = await checkLimit(ctx.tenantId!, "students");
  if (limitError) return { error: limitError };

  await prisma.enrollment.create({
    data: {
      tenantId: ctx.tenantId!,
      studentId,
      campusId,
      academicYearId,
      gradeLevelId,
      sectionId,
      status: "ACTIVE",
      startDate: new Date(),
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.reenrolled",
    targetType: "Student",
    targetId: studentId,
    campusId,
    metadata: { academicYearId, gradeLevelId, sectionId },
  });

  revalidatePath(`/portal/students/${studentId}`);
  return { ok: true, message: "Student reenrolled." };
}

// ADM-006: Suspend a student's active enrollment.
const suspendSchema = z.object({
  studentId: z.string().min(1),
  campusId: z.string().min(1),
  reason: z.string().optional(),
});

export async function suspendEnrollment(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const ctx = await requireUser();
  const parsed = suspendSchema.safeParse({
    studentId: formData.get("studentId"),
    campusId: formData.get("campusId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { studentId, campusId, reason } = parsed.data;
  if (!canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };

  const updated = await prisma.enrollment.updateMany({
    where: { tenantId: ctx.tenantId!, studentId, campusId, status: "ACTIVE" },
    data: { status: "SUSPENDED" },
  });
  if (updated.count === 0) return { error: "No active enrollment found to suspend." };

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.suspended",
    targetType: "Student",
    targetId: studentId,
    campusId,
    metadata: { reason },
  });

  revalidatePath(`/portal/students/${studentId}`);
  return { ok: true, message: "Enrollment suspended." };
}

// ADM-006: Withdraw a student's enrollment (ACTIVE or SUSPENDED → WITHDRAWN).
const withdrawSchema = z.object({
  studentId: z.string().min(1),
  campusId: z.string().min(1),
  reason: z.string().min(1),
});

export async function withdrawEnrollment(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const ctx = await requireUser();
  const parsed = withdrawSchema.safeParse({
    studentId: formData.get("studentId"),
    campusId: formData.get("campusId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Reason is required." };
  const { studentId, campusId, reason } = parsed.data;
  if (!canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };

  const updated = await prisma.enrollment.updateMany({
    where: {
      tenantId: ctx.tenantId!,
      studentId,
      campusId,
      status: { in: ["ACTIVE", "SUSPENDED"] },
    },
    data: { status: "WITHDRAWN", endDate: new Date() },
  });
  if (updated.count === 0) return { error: "No active or suspended enrollment found." };

  await prisma.student.updateMany({
    where: { id: studentId, tenantId: ctx.tenantId! },
    data: { status: "WITHDRAWN" },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.withdrawn",
    targetType: "Student",
    targetId: studentId,
    campusId,
    metadata: { reason },
  });

  revalidatePath(`/portal/students/${studentId}`);
  return { ok: true, message: "Student withdrawn." };
}

// SIS-004: StudentDocument model — upload/register a document with expiry.
const documentSchema = z.object({
  studentId: z.string().min(1),
  campusId: z.string().min(1),
  docType: z.string().min(1),
  label: z.string().min(1),
  expiresAt: z.string().optional(),
  fileUrl: z.string().url().optional().or(z.literal("")),
});

export async function registerStudentDocument(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const ctx = await requireUser();
  const parsed = documentSchema.safeParse({
    studentId: formData.get("studentId"),
    campusId: formData.get("campusId"),
    docType: formData.get("docType"),
    label: formData.get("label"),
    expiresAt: formData.get("expiresAt") || undefined,
    fileUrl: formData.get("fileUrl") || undefined,
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { studentId, campusId, docType, label, expiresAt, fileUrl } = parsed.data;
  if (!canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };

  await prisma.studentDocument.create({
    data: {
      tenantId: ctx.tenantId!,
      studentId,
      campusId,
      docType,
      reference: label,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      fileUrl: fileUrl || null,
    },
  });

  revalidatePath(`/portal/students/${studentId}`);
  return { ok: true, message: "Document registered." };
}

// SIS-005: Bulk section reassignment with preview — update multiple students' active enrollment sectionId.
const bulkReassignSchema = z.object({
  campusId: z.string().min(1),
  fromSectionId: z.string().min(1),
  toSectionId: z.string().min(1),
  preview: z.coerce.boolean().default(false),
});

export async function bulkReassignSection(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState & { affectedCount?: number; studentNames?: string[] }> {
  const ctx = await requireUser();
  const parsed = bulkReassignSchema.safeParse({
    campusId: formData.get("campusId"),
    fromSectionId: formData.get("fromSectionId"),
    toSectionId: formData.get("toSectionId"),
    preview: formData.get("preview"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, fromSectionId, toSectionId, preview } = parsed.data;
  if (!canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };

  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId: ctx.tenantId!, campusId, sectionId: fromSectionId, status: "ACTIVE" },
    include: { student: { include: { person: true } } },
  });

  if (preview) {
    return {
      ok: true,
      affectedCount: enrollments.length,
      studentNames: enrollments.map((e) => `${e.student.person.firstName} ${e.student.person.lastName}`),
      message: `${enrollments.length} student(s) will be moved.`,
    };
  }

  const ids = enrollments.map((e) => e.id);
  await prisma.enrollment.updateMany({
    where: { id: { in: ids } },
    data: { sectionId: toSectionId },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.bulk.reassign",
    targetType: "Section",
    targetId: fromSectionId,
    campusId,
    metadata: { fromSectionId, toSectionId, count: ids.length },
  });

  revalidatePath("/portal/students");
  return { ok: true, affectedCount: ids.length, message: `${ids.length} student(s) moved.` };
}

// SIS-005: Bulk grade promotion — advance all active students to next grade level.
const bulkPromoteSchema = z.object({
  campusId: z.string().min(1),
  fromGradeLevelId: z.string().min(1),
  toGradeLevelId: z.string().min(1),
  toSectionId: z.string().min(1),
  toAcademicYearId: z.string().min(1),
  preview: z.coerce.boolean().default(false),
});

export async function bulkPromoteGrade(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState & { affectedCount?: number }> {
  const ctx = await requireUser();
  const parsed = bulkPromoteSchema.safeParse({
    campusId: formData.get("campusId"),
    fromGradeLevelId: formData.get("fromGradeLevelId"),
    toGradeLevelId: formData.get("toGradeLevelId"),
    toSectionId: formData.get("toSectionId"),
    toAcademicYearId: formData.get("toAcademicYearId"),
    preview: formData.get("preview"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, fromGradeLevelId, toGradeLevelId, toSectionId, toAcademicYearId, preview } = parsed.data;
  if (!canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };

  const enrollments = await prisma.enrollment.findMany({
    where: { tenantId: ctx.tenantId!, campusId, gradeLevelId: fromGradeLevelId, status: "ACTIVE" },
  });

  if (preview) {
    return { ok: true, affectedCount: enrollments.length, message: `${enrollments.length} student(s) will be promoted.` };
  }

  await prisma.$transaction(async (tx) => {
    // Close existing enrollments
    await tx.enrollment.updateMany({
      where: { id: { in: enrollments.map((e) => e.id) } },
      data: { status: "COMPLETED", endDate: new Date() },
    });
    // Create new enrollments in the promoted grade
    for (const e of enrollments) {
      await tx.enrollment.create({
        data: {
          tenantId: ctx.tenantId!,
          studentId: e.studentId,
          campusId,
          academicYearId: toAcademicYearId,
          gradeLevelId: toGradeLevelId,
          sectionId: toSectionId,
          status: "ACTIVE",
          startDate: new Date(),
        },
      });
    }
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.bulk.promote",
    targetType: "GradeLevel",
    targetId: fromGradeLevelId,
    campusId,
    metadata: { fromGradeLevelId, toGradeLevelId, count: enrollments.length },
  });

  revalidatePath("/portal/students");
  return { ok: true, affectedCount: enrollments.length, message: `${enrollments.length} student(s) promoted.` };
}

// C.3: Update financiallyResponsible / canPickup / receivesNotifications flags on a guardian link.
export async function updateGuardianLink(formData: FormData): Promise<StudentActionState> {
  const ctx = await requireUser();
  const id = String(formData.get("id") || "");
  const link = await prisma.guardianRelationship.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: { student: { include: { enrollments: { where: { status: "ACTIVE" }, take: 1 } } } },
  });
  if (!link) return { error: "Guardian link not found." };
  const campusId = link.student.enrollments[0]?.campusId;
  if (!campusId || !canForCampus(ctx, "student.write", campusId))
    return { error: "You need student.write permission to edit guardian links." };

  const data = {
    financiallyResponsible: formData.get("financiallyResponsible") === "true",
    canPickup: formData.get("canPickup") === "true",
    receivesNotifications: formData.get("receivesNotifications") === "true",
    isPrimaryContact: formData.get("isPrimaryContact") === "true",
  };
  await prisma.guardianRelationship.update({ where: { id }, data });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.guardianlink.updated",
    targetType: "Student",
    targetId: link.studentId,
    campusId,
    metadata: data,
  });
  revalidatePath(`/portal/students/${link.studentId}`);
  return { ok: true, message: "Guardian link updated." };
}

// Check documents expiring within N days (SIS-004) — called by cron.
export async function getExpiringDocuments(tenantId: string, withinDays = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  return prisma.studentDocument.findMany({
    where: {
      tenantId,
      expiresAt: { lte: cutoff, gte: new Date() },
    },
    include: { student: { include: { person: true } } },
    orderBy: { expiresAt: "asc" },
  });
}
