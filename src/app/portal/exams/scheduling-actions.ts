"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus, canAnywhere } from "@/lib/rbac";
import { ensureDefaultCompetencies } from "@/lib/competencies";
import { audit } from "@/lib/audit";

export interface ExamScheduleState {
  ok?: boolean;
  error?: string;
  message?: string;
  conflicts?: string[];
}

const scheduleSchema = z.object({
  campusId: z.string().min(1),
  assessmentPlanId: z.string().optional(),
  name: z.string().min(1),
  examDate: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  roomId: z.string().optional(),
  staffIds: z.string().optional(), // comma-separated
  sectionId: z.string().optional(), // for round-robin seating
});

// EXM-002: Create an exam schedule with conflict detection.
export async function createExamSchedule(
  _prev: ExamScheduleState,
  formData: FormData,
): Promise<ExamScheduleState> {
  const ctx = await requireUser();
  const parsed = scheduleSchema.safeParse({
    campusId: formData.get("campusId"),
    assessmentPlanId: formData.get("assessmentPlanId") || undefined,
    name: formData.get("name"),
    examDate: formData.get("examDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    roomId: formData.get("roomId") || undefined,
    staffIds: formData.get("staffIds") || undefined,
    sectionId: formData.get("sectionId") || undefined,
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, assessmentPlanId, name, examDate, startTime, endTime, roomId, staffIds, sectionId } = parsed.data;
  if (!canForCampus(ctx, "exams.manage", campusId)) return { error: "Permission denied." };

  const conflicts: string[] = [];
  const date = new Date(examDate);

  // Conflict check: same room + overlapping time on the same date.
  if (roomId) {
    const roomConflict = await prisma.examSchedule.findFirst({
      where: {
        tenantId: ctx.tenantId!,
        campusId,
        roomId,
        examDate: date,
      },
    });
    if (roomConflict) conflicts.push(`Room already booked for "${roomConflict.name}" on this date.`);
  }

  // Conflict check: invigilator already assigned elsewhere on this date.
  const staffList = staffIds ? staffIds.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (staffList.length > 0) {
    const staffConflicts = await prisma.examInvigilator.findMany({
      where: {
        tenantId: ctx.tenantId!,
        staffId: { in: staffList },
        examSchedule: { examDate: date, campusId },
      },
      include: { examSchedule: true, staff: { include: { person: true } } },
    });
    for (const sc of staffConflicts) {
      conflicts.push(`${sc.staff.person.firstName} ${sc.staff.person.lastName} already assigned to "${sc.examSchedule.name}".`);
    }
  }

  if (conflicts.length > 0) return { error: "Scheduling conflicts detected.", conflicts };

  const schedule = await prisma.$transaction(async (tx) => {
    const s = await tx.examSchedule.create({
      data: {
        tenantId: ctx.tenantId!,
        campusId,
        assessmentPlanId,
        name,
        examDate: date,
        startTime,
        endTime,
        roomId: roomId || null,
      },
    });

    // Add invigilators.
    if (staffList.length > 0) {
      await tx.examInvigilator.createMany({
        data: staffList.map((staffId, i) => ({
          tenantId: ctx.tenantId!,
          examScheduleId: s.id,
          staffId,
          isPrimary: i === 0,
        })),
      });
    }

    // Round-robin seat assignments from the section's active enrollments.
    if (sectionId) {
      const enrollments = await tx.enrollment.findMany({
        where: { tenantId: ctx.tenantId!, sectionId, campusId, status: "ACTIVE" },
        orderBy: { rollNumber: "asc" },
        include: { student: true },
      });
      await tx.seatAssignment.createMany({
        data: enrollments.map((e, i) => ({
          tenantId: ctx.tenantId!,
          examScheduleId: s.id,
          studentId: e.studentId,
          seatNumber: String(i + 1).padStart(3, "0"),
        })),
      });
    }

    return s;
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "exams.schedule.created",
    targetType: "ExamSchedule",
    targetId: schedule.id,
    campusId,
    metadata: { name, examDate, roomId },
  });

  revalidatePath("/portal/exams");
  return { ok: true, message: "Exam scheduled." };
}

// EXM-005: Save competency ratings and the conduct remark for a published result.
export async function saveCompetencyRatings(
  _prev: ExamScheduleState,
  formData: FormData,
): Promise<ExamScheduleState> {
  const ctx = await requireUser();
  const studentResultId = String(formData.get("studentResultId") ?? "");
  const conductRemark = formData.has("conductRemark") ? String(formData.get("conductRemark")).trim().slice(0, 500) : undefined;

  // The result (and so the campus) is resolved server-side from the school's own data.
  const result = await prisma.studentResult.findFirst({
    where: { id: studentResultId, tenantId: ctx.tenantId! },
    include: { version: { include: { plan: { select: { id: true, campusId: true } } } } },
  });
  if (!result) return { error: "Result not found." };
  const campusId = result.version.plan.campusId;
  if (!canForCampus(ctx, "exams.enter", campusId)) return { error: "Permission denied." };
  if (result.version.status !== "PUBLISHED") return { error: "Ratings can only be recorded on the current published result." };

  const competencies = await prisma.competency.findMany({ where: { tenantId: ctx.tenantId! }, select: { id: true } });
  const known = new Set(competencies.map((c) => c.id));
  const rows: { competencyId: string; rating: number; comment: string | null }[] = [];
  const clear: string[] = [];
  for (const id of known) {
    const raw = String(formData.get(`rating:${id}`) ?? "");
    if (raw === "") { clear.push(id); continue; }
    const rating = Number(raw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 4) return { error: "Ratings must be between 1 and 4." };
    const comment = String(formData.get(`comment:${id}`) ?? "").trim().slice(0, 300);
    rows.push({ competencyId: id, rating, comment: comment || null });
  }

  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.studentCompetencyRating.upsert({
        where: { studentResultId_competencyId: { studentResultId, competencyId: r.competencyId } },
        create: { tenantId: ctx.tenantId!, studentResultId, ...r },
        update: { rating: r.rating, comment: r.comment },
      });
    }
    if (clear.length) await tx.studentCompetencyRating.deleteMany({ where: { studentResultId, competencyId: { in: clear } } });
    if (conductRemark !== undefined) {
      await tx.studentResult.update({ where: { id: studentResultId }, data: { conductRemark: conductRemark || null } });
    }
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "exams.competency.save",
    targetType: "StudentResult",
    targetId: studentResultId,
    campusId,
    scopeType: "CAMPUS",
    metadata: { rated: rows.length, conduct: conductRemark !== undefined },
  });
  revalidatePath(`/portal/exams/${result.version.plan.id}/report/${result.studentId}`);
  return { ok: true, message: "Saved." };
}

// Adds the standard competency set when the school has none (needs exams.manage).
export async function seedDefaultCompetencies(
  _prev: ExamScheduleState,
  _formData: FormData,
): Promise<ExamScheduleState> {
  const ctx = await requireUser();
  if (!canAnywhere(ctx, "exams.manage")) return { error: "Permission denied." };
  const added = await ensureDefaultCompetencies(ctx.tenantId!);
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "exams.competency.seed", metadata: { added } });
  revalidatePath("/portal/exams");
  return { ok: true, message: added ? "Standard competencies added." : "Competencies already exist." };
}
