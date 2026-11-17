"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface ExamScheduleActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const createScheduleSchema = z.object({
  campusId: z.string().min(1),
  assessmentPlanId: z.string().optional(),
  name: z.string().min(1).max(200),
  examDate: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  roomId: z.string().optional(),
});

export async function createExamSchedule(
  _prev: ExamScheduleActionState,
  formData: FormData,
): Promise<ExamScheduleActionState> {
  const ctx = await requireUser();
  const parsed = createScheduleSchema.safeParse({
    campusId: formData.get("campusId"),
    assessmentPlanId: formData.get("assessmentPlanId") || undefined,
    name: formData.get("name"),
    examDate: formData.get("examDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    roomId: formData.get("roomId") || undefined,
  });
  if (!parsed.success) return { error: "Invalid form data" };

  const { campusId, assessmentPlanId, name, examDate, startTime, endTime, roomId } = parsed.data;
  if (!canForCampus(ctx, "exams.manage", campusId)) {
    return { error: "You do not have permission to schedule exams." };
  }

  const schedule = await prisma.examSchedule.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      assessmentPlanId,
      name,
      examDate: new Date(examDate),
      startTime,
      endTime,
      roomId,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "exam.schedule.created",
    targetType: "ExamSchedule",
    targetId: schedule.id,
    campusId,
    metadata: { name, examDate },
  });

  revalidatePath("/portal/exams/schedule");
  return { ok: true, message: "Exam scheduled." };
}

// Round-robin seat assignment for an exam schedule.
export async function assignSeats(scheduleId: string, campusId: string): Promise<ExamScheduleActionState> {
  const ctx = await requireUser();
  if (!canForCampus(ctx, "exams.manage", campusId)) {
    return { error: "You do not have permission to assign seats." };
  }

  const schedule = await prisma.examSchedule.findFirst({
    where: { id: scheduleId, tenantId: ctx.tenantId! },
    include: { seatAssignments: true },
  });
  if (!schedule) return { error: "Schedule not found." };

  // Get enrolled students for the campus
  const enrollments = await prisma.enrollment.findMany({
    where: { campusId, status: "ACTIVE", tenantId: ctx.tenantId! },
    select: { studentId: true },
    orderBy: { studentId: "asc" },
  });

  const alreadyAssigned = new Set(schedule.seatAssignments.map((s) => s.studentId));
  const toAssign = enrollments
    .map((e) => e.studentId)
    .filter((id) => !alreadyAssigned.has(id));

  if (toAssign.length === 0) return { ok: true, message: "All students already have seats." };

  const nextSeatNum = schedule.seatAssignments.length + 1;
  await prisma.seatAssignment.createMany({
    data: toAssign.map((studentId, i) => ({
      tenantId: ctx.tenantId!,
      examScheduleId: scheduleId,
      studentId,
      seatNumber: String(nextSeatNum + i).padStart(3, "0"),
    })),
    skipDuplicates: true,
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "exam.seats.assigned",
    targetType: "ExamSchedule",
    targetId: scheduleId,
    campusId,
    metadata: { count: toAssign.length },
  });

  revalidatePath("/portal/exams/schedule");
  return { ok: true, message: `${toAssign.length} seat(s) assigned.` };
}
