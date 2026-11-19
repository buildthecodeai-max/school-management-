"use server";

import { DOCUMENT_TYPES } from "@/lib/student-documents";
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

// SIS-004: register a document (with optional expiry) against a student. The
// campus is taken from the student's own enrollment, never from the form.
export async function registerStudentDocument(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const ctx = await requireUser();
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const student = ctx.tenantId
    ? await prisma.student.findFirst({
        where: { id: str("studentId"), tenantId: ctx.tenantId },
        include: { enrollments: { orderBy: { startDate: "desc" }, take: 1 } },
      })
    : null;
  if (!student) return { error: "Student not found." };
  const campusId = student.enrollments[0]?.campusId;
  if (!campusId || !canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };

  const docType = str("docType");
  if (!(DOCUMENT_TYPES as readonly string[]).includes(docType)) return { error: "Choose a document type." };
  const reference = str("reference").slice(0, 120);
  const issuedAt = str("issuedAt") ? new Date(str("issuedAt")) : null;
  const expiresAt = str("expiresAt") ? new Date(str("expiresAt")) : null;
  if ((issuedAt && Number.isNaN(issuedAt.getTime())) || (expiresAt && Number.isNaN(expiresAt.getTime()))) return { error: "Enter valid dates." };
  if (issuedAt && expiresAt && expiresAt <= issuedAt) return { error: "The expiry date must be after the issue date." };
  const fileUrl = str("fileUrl");
  if (fileUrl && !/^https?:\/\/\S+$/i.test(fileUrl)) return { error: "The file link must start with http:// or https://." };

  const doc = await prisma.studentDocument.create({
    data: {
      tenantId: ctx.tenantId!,
      studentId: student.id,
      campusId,
      docType,
      reference: reference || null,
      issuedAt,
      expiresAt,
      status: expiresAt && expiresAt < new Date() ? "EXPIRED" : "VALID",
      fileUrl: fileUrl || null,
    },
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.document.registered",
    targetType: "StudentDocument",
    targetId: doc.id,
    campusId,
    scopeType: "CAMPUS",
    metadata: { studentId: student.id, docType, expiresAt: expiresAt?.toISOString() ?? null },
  });
  revalidatePath(`/portal/students/${student.id}`);
  return { ok: true, message: "Document registered." };
}

export async function removeStudentDocument(
  _prev: StudentActionState,
  formData: FormData,
): Promise<StudentActionState> {
  const ctx = await requireUser();
  const doc = ctx.tenantId
    ? await prisma.studentDocument.findFirst({ where: { id: String(formData.get("id") ?? ""), tenantId: ctx.tenantId } })
    : null;
  if (!doc || !canForCampus(ctx, "student.write", doc.campusId)) return { error: "Permission denied." };
  await prisma.studentDocument.delete({ where: { id: doc.id } });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "student.document.removed",
    targetType: "StudentDocument",
    targetId: doc.id,
    campusId: doc.campusId,
    scopeType: "CAMPUS",
    metadata: { studentId: doc.studentId, docType: doc.docType },
  });
  revalidatePath(`/portal/students/${doc.studentId}`);
  return { ok: true, message: "Document removed." };
}

// SIS-005: Bulk operations. Both preview first (mode=preview changes nothing), then commit
// (mode=commit) inside one transaction, with every id checked against this school and campus.
export type BulkState = StudentActionState & { affectedCount?: number; studentNames?: string[]; warnings?: string[] };
const fstr = (f: FormData, k: string) => String(f.get(k) ?? "").trim().slice(0, 60);
const modeOf = (f: FormData) => (fstr(f, "mode") === "commit" ? "commit" : "preview");

export async function bulkReassignSection(_p: BulkState, f: FormData): Promise<BulkState> {
  const ctx = await requireUser();
  const mode = modeOf(f);
  const [from, to] = await Promise.all([
    prisma.section.findFirst({ where: { id: fstr(f, "fromSectionId"), tenantId: ctx.tenantId! } }),
    prisma.section.findFirst({ where: { id: fstr(f, "toSectionId"), tenantId: ctx.tenantId! } }),
  ]);
  if (!from || !to) return { error: "Choose both sections." };
  if (from.id === to.id) return { error: "Choose two different sections." };
  // The campus comes from the sections, never from the form.
  if (from.campusId !== to.campusId) return { error: "Both sections must be on the same campus. Use a campus transfer to move students between campuses." };
  if (!canForCampus(ctx, "student.write", from.campusId)) return { error: "Permission denied." };
  if (from.gradeLevelId !== to.gradeLevelId || from.academicYearId !== to.academicYearId)
    return { error: "Sections must be in the same grade and academic year. Use promotion to change grade." };

  const [enrollments, occupied] = await Promise.all([
    prisma.enrollment.findMany({ where: { tenantId: ctx.tenantId!, sectionId: from.id, status: "ACTIVE" }, include: { student: { include: { person: true } } }, orderBy: { rollNumber: "asc" } }),
    prisma.enrollment.count({ where: { tenantId: ctx.tenantId!, sectionId: to.id, status: "ACTIVE" } }),
  ]);
  if (enrollments.length === 0) return { error: "There are no active students in that section." };
  if (to.capacity > 0 && occupied + enrollments.length > to.capacity)
    return { error: `${to.name} has ${to.capacity - occupied} free place(s) but ${enrollments.length} student(s) would move.` };
  const names = enrollments.map((e) => `${e.student.person.firstName} ${e.student.person.lastName}`);
  if (mode === "preview") return { ok: true, affectedCount: enrollments.length, studentNames: names, message: `${enrollments.length} student(s) will move from ${from.name} to ${to.name}. Confirm to apply.` };

  const moved = await prisma.$transaction(async (tx) => {
    const r = await tx.enrollment.updateMany({ where: { id: { in: enrollments.map((e) => e.id) }, status: "ACTIVE", sectionId: from.id }, data: { sectionId: to.id, rollNumber: null } });
    return r.count;
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "student.bulk.reassign", targetType: "Section", targetId: from.id, campusId: from.campusId, scopeType: "CAMPUS", metadata: { fromSectionId: from.id, toSectionId: to.id, count: moved } });
  revalidatePath("/portal/students");
  return { ok: true, affectedCount: moved, message: `${moved} student(s) moved to ${to.name}. Roll numbers were cleared; assign new ones if you use them.` };
}

// SIS-005: Year-end promotion: close each active enrollment in a grade and open one in the next.
export async function bulkPromoteGrade(_p: BulkState, f: FormData): Promise<BulkState> {
  const ctx = await requireUser();
  const mode = modeOf(f);
  const [fromGrade, toSection] = await Promise.all([
    prisma.gradeLevel.findFirst({ where: { id: fstr(f, "fromGradeLevelId"), tenantId: ctx.tenantId! } }),
    prisma.section.findFirst({ where: { id: fstr(f, "toSectionId"), tenantId: ctx.tenantId! }, include: { gradeLevel: true, academicYear: true } }),
  ]);
  if (!fromGrade || !toSection) return { error: "Choose the grade to promote and the section they move into." };
  // Target grade and year come from the chosen section, so the three can never disagree.
  const campusId = fromGrade.campusId;
  if (toSection.campusId !== campusId) return { error: "The target section must be on the same campus." };
  if (!canForCampus(ctx, "student.write", campusId)) return { error: "Permission denied." };
  if (toSection.gradeLevelId === fromGrade.id) return { error: "Choose a section in a different grade than the one being promoted." };

  const [enrollments, occupied] = await Promise.all([
    prisma.enrollment.findMany({ where: { tenantId: ctx.tenantId!, campusId, gradeLevelId: fromGrade.id, status: "ACTIVE" }, include: { student: { include: { person: true } } } }),
    prisma.enrollment.count({ where: { tenantId: ctx.tenantId!, sectionId: toSection.id, status: "ACTIVE" } }),
  ]);
  if (enrollments.length === 0) return { error: `There are no active students in ${fromGrade.name}.` };
  if (enrollments.some((e) => e.academicYearId === toSection.academicYearId))
    return { error: `Some of these students are already enrolled in ${toSection.academicYear.name}. Promotion moves students into a later year.` };
  if (toSection.capacity > 0 && occupied + enrollments.length > toSection.capacity)
    return { error: `${toSection.name} has ${Math.max(0, toSection.capacity - occupied)} free place(s) but ${enrollments.length} student(s) would be promoted. Pick a larger section or promote in groups.` };
  const names = enrollments.map((e) => `${e.student.person.firstName} ${e.student.person.lastName}`);
  if (mode === "preview") return { ok: true, affectedCount: enrollments.length, studentNames: names, message: `${enrollments.length} student(s) will move from ${fromGrade.name} to ${toSection.gradeLevel.name} (${toSection.name}, ${toSection.academicYear.name}). Confirm to apply.` };

  const now = new Date();
  const done = await prisma.$transaction(async (tx) => {
    const closed = await tx.enrollment.updateMany({ where: { id: { in: enrollments.map((e) => e.id) }, status: "ACTIVE" }, data: { status: "COMPLETED", endDate: now } });
    if (closed.count !== enrollments.length) throw new Error("STALE_PROMOTION");
    await tx.enrollment.createMany({ data: enrollments.map((e) => ({ tenantId: ctx.tenantId!, studentId: e.studentId, campusId, academicYearId: toSection.academicYearId, gradeLevelId: toSection.gradeLevelId, sectionId: toSection.id, status: "ACTIVE" as const, startDate: now })) });
    return closed.count;
  }).catch((e) => (e instanceof Error && e.message === "STALE_PROMOTION" ? null : Promise.reject(e)));
  if (done === null) return { error: "Some students changed while you were working. Run the preview again." };

  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "student.bulk.promote", targetType: "GradeLevel", targetId: fromGrade.id, campusId, scopeType: "CAMPUS", metadata: { fromGradeLevelId: fromGrade.id, toGradeLevelId: toSection.gradeLevelId, toSectionId: toSection.id, count: done } });
  revalidatePath("/portal/students");
  return { ok: true, affectedCount: done, message: `${done} student(s) promoted to ${toSection.gradeLevel.name}.` };
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
