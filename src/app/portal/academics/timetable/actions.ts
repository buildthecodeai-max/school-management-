"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { detectConflicts } from "@/lib/timetable";

export interface TimetableActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  conflicts?: { type: string; dayOfWeek: string; periodNumber: number }[];
}

const createVersionSchema = z.object({
  campusId: z.string().min(1),
  academicYearId: z.string().min(1),
  termId: z.string().optional(),
  name: z.string().min(1).max(100),
});

export async function createTimetableVersion(
  _prev: TimetableActionState,
  formData: FormData,
): Promise<TimetableActionState> {
  const ctx = await requireUser();
  const parsed = createVersionSchema.safeParse({
    campusId: formData.get("campusId"),
    academicYearId: formData.get("academicYearId"),
    termId: formData.get("termId") || undefined,
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: "Invalid form data" };

  const { campusId, academicYearId, termId, name } = parsed.data;

  if (!canForCampus(ctx, "timetable.write", campusId)) {
    return { error: "You do not have permission to create timetables." };
  }

  const version = await prisma.timetableVersion.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      academicYearId,
      termId,
      name,
      status: "DRAFT",
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "timetable.version.created",
    targetType: "TimetableVersion",
    targetId: version.id,
    campusId,
  });

  revalidatePath("/portal/academics/timetable");
  return { ok: true, message: `Timetable version "${name}" created.` };
}

const addSlotSchema = z.object({
  versionId: z.string().min(1),
  sectionId: z.string().min(1),
  subjectId: z.string().min(1),
  staffId: z.string().optional(),
  roomId: z.string().optional(),
  dayOfWeek: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  periodNumber: z.coerce.number().int().min(1).max(12),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function addTimetableSlot(
  _prev: TimetableActionState,
  formData: FormData,
): Promise<TimetableActionState> {
  const ctx = await requireUser();
  const parsed = addSlotSchema.safeParse({
    versionId: formData.get("versionId"),
    sectionId: formData.get("sectionId"),
    subjectId: formData.get("subjectId"),
    staffId: formData.get("staffId") || undefined,
    roomId: formData.get("roomId") || undefined,
    dayOfWeek: formData.get("dayOfWeek"),
    periodNumber: formData.get("periodNumber"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
  if (!parsed.success) return { error: "Invalid slot data" };

  const { versionId, sectionId, subjectId, staffId, roomId, dayOfWeek, periodNumber, startTime, endTime } =
    parsed.data;

  const version = await prisma.timetableVersion.findFirst({
    where: { id: versionId, tenantId: ctx.tenantId! },
    select: { campusId: true, status: true },
  });
  if (!version) return { error: "Version not found." };
  if (version.status === "ARCHIVED") return { error: "Cannot modify an archived version." };

  if (!canForCampus(ctx, "timetable.write", version.campusId)) {
    return { error: "You do not have permission to edit this timetable." };
  }

  // Load existing slots to run conflict detection
  const existing = await prisma.timetableSlot.findMany({
    where: { versionId },
    select: {
      id: true,
      sectionId: true,
      subjectId: true,
      staffId: true,
      roomId: true,
      dayOfWeek: true,
      periodNumber: true,
    },
  });

  const candidate = { sectionId, subjectId, staffId, roomId, dayOfWeek, periodNumber };
  const conflicts = detectConflicts([...existing, candidate]);
  if (conflicts.length > 0) {
    return {
      error: "Conflict detected — a staff member, room, or section is already booked in that slot.",
      conflicts: conflicts.map((c) => ({
        type: c.type,
        dayOfWeek: c.dayOfWeek,
        periodNumber: c.periodNumber,
      })),
    };
  }

  const slot = await prisma.timetableSlot.create({
    data: {
      tenantId: ctx.tenantId!,
      versionId,
      sectionId,
      subjectId,
      staffId: staffId ?? null,
      roomId: roomId ?? null,
      dayOfWeek,
      periodNumber,
      startTime,
      endTime,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "timetable.slot.added",
    targetType: "TimetableSlot",
    targetId: slot.id,
    campusId: version.campusId,
    metadata: { versionId, dayOfWeek, periodNumber },
  });

  revalidatePath("/portal/academics/timetable");
  return { ok: true, message: "Slot added." };
}

export async function publishTimetableVersion(versionId: string): Promise<TimetableActionState> {
  const ctx = await requireUser();

  const version = await prisma.timetableVersion.findFirst({
    where: { id: versionId, tenantId: ctx.tenantId! },
  });
  if (!version) return { error: "Version not found." };

  if (!canForCampus(ctx, "timetable.publish", version.campusId)) {
    return { error: "You do not have permission to publish timetables." };
  }

  if (version.status === "ACTIVE") return { error: "Already published." };

  await prisma.$transaction(async (tx) => {
    // Archive the current active version for this campus
    await tx.timetableVersion.updateMany({
      where: { campusId: version.campusId, status: "ACTIVE" },
      data: { status: "ARCHIVED" },
    });
    // Activate this version
    await tx.timetableVersion.update({
      where: { id: versionId },
      data: { status: "ACTIVE", publishedByUserId: ctx.user.id, publishedAt: new Date() },
    });
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "timetable.version.published",
    targetType: "TimetableVersion",
    targetId: versionId,
    campusId: version.campusId,
  });

  revalidatePath("/portal/academics/timetable");
  return { ok: true, message: "Timetable published." };
}
