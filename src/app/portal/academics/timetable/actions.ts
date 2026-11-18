"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { detectConflicts, validTimes } from "@/lib/timetable";

export interface TimetableActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  conflicts?: { type: string; dayOfWeek: string; periodNumber: number }[];
  versionId?: string;
}

const createVersionSchema = z.object({
  academicYearId: z.string().min(1),
  termId: z.string().optional(),
  name: z.string().trim().min(1).max(100),
});

export async function createTimetableVersion(
  _prev: TimetableActionState,
  formData: FormData,
): Promise<TimetableActionState> {
  const ctx = await requireUser();
  const parsed = createVersionSchema.safeParse({
    academicYearId: formData.get("academicYearId"),
    termId: formData.get("termId") || undefined,
    name: formData.get("name"),
  });
  if (!parsed.success) return { error: "Enter a version name and choose an academic year." };
  const { academicYearId, termId, name } = parsed.data;

  // The campus comes from the academic year, never from the client.
  const year = await prisma.academicYear.findFirst({
    where: { id: academicYearId, tenantId: ctx.tenantId! },
    select: { campusId: true },
  });
  if (!year) return { error: "Academic year not found." };
  const campusId = year.campusId;

  if (!canForCampus(ctx, "timetable.write", campusId)) {
    return { error: "You do not have permission to create timetables." };
  }
  if (termId) {
    const term = await prisma.term.findFirst({ where: { id: termId, academicYearId, tenantId: ctx.tenantId! } });
    if (!term) return { error: "That term does not belong to the academic year." };
  }
  const dupe = await prisma.timetableVersion.findFirst({ where: { campusId, tenantId: ctx.tenantId!, name } });
  if (dupe) return { error: `A version named "${name}" already exists on this campus.` };

  const version = await prisma.timetableVersion.create({
    data: { tenantId: ctx.tenantId!, campusId, academicYearId, termId, name, status: "DRAFT" },
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
  return { ok: true, message: `Timetable version "${name}" created.`, versionId: version.id };
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
  if (version.status !== "DRAFT") return { error: "Only draft versions can be edited. Create a new version to change a published timetable." };

  if (!canForCampus(ctx, "timetable.write", version.campusId)) {
    return { error: "You do not have permission to edit this timetable." };
  }
  if (!validTimes(startTime, endTime)) return { error: "Use valid times (HH:MM) with the end after the start." };

  // Everything referenced must belong to this school, and the campus of this version.
  const [section, subject, staff, room] = await Promise.all([
    prisma.section.findFirst({ where: { id: sectionId, tenantId: ctx.tenantId!, campusId: version.campusId }, select: { id: true } }),
    prisma.subject.findFirst({ where: { id: subjectId, tenantId: ctx.tenantId!, OR: [{ campusId: null }, { campusId: version.campusId }] }, select: { id: true } }),
    staffId ? prisma.staff.findFirst({ where: { id: staffId, tenantId: ctx.tenantId!, employmentRecords: { some: { campusId: version.campusId } } }, select: { id: true } }) : Promise.resolve(true),
    roomId ? prisma.room.findFirst({ where: { id: roomId, tenantId: ctx.tenantId!, campusId: version.campusId }, select: { id: true } }) : Promise.resolve(true),
  ]);
  if (!section) return { error: "Section not found on this campus." };
  if (!subject) return { error: "Subject not found." };
  if (!staff) return { error: "That staff member does not work at this campus." };
  if (!room) return { error: "Room not found on this campus." };

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
    const kinds = [...new Set(conflicts.map((c) => c.type.toLowerCase()))].join(", ");
    return {
      error: `Conflict: the ${kinds} is already booked in that period.`,
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

export async function removeTimetableSlot(
  _prev: TimetableActionState,
  formData: FormData,
): Promise<TimetableActionState> {
  const ctx = await requireUser();
  const slot = await prisma.timetableSlot.findFirst({
    where: { id: String(formData.get("slotId") ?? ""), tenantId: ctx.tenantId! },
    include: { version: { select: { campusId: true, status: true } } },
  });
  if (!slot) return { error: "Slot not found." };
  if (!canForCampus(ctx, "timetable.write", slot.version.campusId)) return { error: "You do not have permission to edit this timetable." };
  if (slot.version.status !== "DRAFT") return { error: "Only draft versions can be edited." };
  await prisma.timetableSlot.delete({ where: { id: slot.id } });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "timetable.slot.removed",
    targetType: "TimetableSlot",
    targetId: slot.id,
    campusId: slot.version.campusId,
    metadata: { versionId: slot.versionId, dayOfWeek: slot.dayOfWeek, periodNumber: slot.periodNumber },
  });
  revalidatePath("/portal/academics/timetable");
  return { ok: true, message: "Slot removed." };
}

export async function publishTimetableVersion(
  _prev: TimetableActionState,
  formData: FormData,
): Promise<TimetableActionState> {
  const ctx = await requireUser();
  const versionId = String(formData.get("versionId") ?? "");

  const version = await prisma.timetableVersion.findFirst({
    where: { id: versionId, tenantId: ctx.tenantId! },
  });
  if (!version) return { error: "Version not found." };

  if (!canForCampus(ctx, "timetable.publish", version.campusId)) {
    return { error: "You do not have permission to publish timetables." };
  }

  if (version.status === "ACTIVE") return { error: "Already published." };
  if ((await prisma.timetableSlot.count({ where: { versionId } })) === 0)
    return { error: "Add at least one slot before publishing." };

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
