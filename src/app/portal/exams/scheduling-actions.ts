"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
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

// EXM-005: Save competency ratings for a student result.
const competencyRatingSchema = z.object({
  studentResultId: z.string().min(1),
  campusId: z.string().min(1),
  ratings: z.string().min(1), // JSON: [{competencyId, rating, comment?}]
  conductRemark: z.string().optional(),
});

export async function saveCompetencyRatings(
  _prev: ExamScheduleState,
  formData: FormData,
): Promise<ExamScheduleState> {
  const ctx = await requireUser();
  const parsed = competencyRatingSchema.safeParse({
    studentResultId: formData.get("studentResultId"),
    campusId: formData.get("campusId"),
    ratings: formData.get("ratings"),
    conductRemark: formData.get("conductRemark") || undefined,
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { studentResultId, campusId, ratings, conductRemark } = parsed.data;
  if (!canForCampus(ctx, "exams.enter", campusId)) return { error: "Permission denied." };

  let parsedRatings: { competencyId: string; rating: number; comment?: string }[];
  try {
    parsedRatings = JSON.parse(ratings);
  } catch {
    return { error: "Invalid ratings format." };
  }

  await prisma.$transaction(async (tx) => {
    // Upsert each rating.
    for (const r of parsedRatings) {
      await tx.studentCompetencyRating.upsert({
        where: { studentResultId_competencyId: { studentResultId, competencyId: r.competencyId } },
        create: { tenantId: ctx.tenantId!, studentResultId, competencyId: r.competencyId, rating: r.rating, comment: r.comment },
        update: { rating: r.rating, comment: r.comment },
      });
    }
    // Update conductRemark on the StudentResult if provided.
    if (conductRemark !== undefined) {
      await tx.studentResult.update({
        where: { id: studentResultId },
        data: { conductRemark },
      });
    }
  });

  revalidatePath("/portal/exams");
  return { ok: true, message: "Competency ratings saved." };
}

// Seed default competencies for a tenant if none exist.
export async function ensureDefaultCompetencies(tenantId: string) {
  const existing = await prisma.competency.count({ where: { tenantId } });
  if (existing > 0) return;

  await prisma.competency.createMany({
    data: [
      { tenantId, code: "COLLAB", name: "Collaboration", description: "Works effectively with others" },
      { tenantId, code: "COMM", name: "Communication", description: "Expresses ideas clearly" },
      { tenantId, code: "CRIT", name: "Critical Thinking", description: "Analyses and evaluates information" },
      { tenantId, code: "SELF", name: "Self-Management", description: "Organises time and completes tasks" },
      { tenantId, code: "RESIL", name: "Resilience", description: "Persists through challenges" },
    ],
  });
}
