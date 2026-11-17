"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export interface TransportActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const tripSchema = z.object({
  routeId: z.string().min(1),
  campusId: z.string().min(1),
  tripDate: z.string().min(1),
  direction: z.enum(["MORNING", "AFTERNOON", "OTHER"]),
  records: z.string().min(1), // JSON string of [{studentId, status}]
});

export async function recordTrip(
  _prev: TransportActionState,
  formData: FormData,
): Promise<TransportActionState> {
  const ctx = await requireUser();
  const parsed = tripSchema.safeParse({
    routeId: formData.get("routeId"),
    campusId: formData.get("campusId"),
    tripDate: formData.get("tripDate"),
    direction: formData.get("direction"),
    records: formData.get("records"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { routeId, campusId, tripDate, direction, records } = parsed.data;

  if (!canForCampus(ctx, "transport.trip.record", campusId)) {
    return { error: "Permission denied." };
  }

  let parsedRecords: { studentId: string; status: string }[];
  try {
    parsedRecords = JSON.parse(records);
  } catch {
    return { error: "Invalid records format." };
  }

  const trip = await prisma.tripAttendance.create({
    data: {
      tenantId: ctx.tenantId!,
      routeId,
      tripDate: new Date(tripDate),
      direction,
      records: parsedRecords,
      recordedByUserId: ctx.user.id,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "transport.trip.recorded",
    targetType: "TripAttendance",
    targetId: trip.id,
    campusId,
    metadata: { routeId, direction, count: parsedRecords.length },
  });

  // TRP-notify: alert guardians of BOARDED / ABSENT events.
  const boardedIds = parsedRecords.filter((r) => r.status === "BOARDED").map((r) => r.studentId);
  const absentIds = parsedRecords.filter((r) => r.status === "ABSENT").map((r) => r.studentId);
  const alertIds = [...boardedIds, ...absentIds];

  if (alertIds.length > 0) {
    const links = await prisma.guardianRelationship.findMany({
      where: {
        tenantId: ctx.tenantId!,
        studentId: { in: alertIds },
        receivesNotifications: true,
      },
      include: {
        guardian: { include: { person: { include: { user: true } } } },
        student: { include: { person: true } },
      },
    });
    for (const link of links) {
      const guardianUser = link.guardian.person.user;
      if (!guardianUser) continue;
      const statusLabel = boardedIds.includes(link.studentId) ? "boarded" : "absent";
      await notify({
        tenantId: ctx.tenantId!,
        recipientUserId: guardianUser.id,
        category: "ATTENDANCE",
        title: `Transport update — ${link.student.person.firstName} ${link.student.person.lastName}`,
        body: `${link.student.person.firstName} ${link.student.person.lastName} has ${statusLabel} the ${direction.toLowerCase()} bus on ${tripDate}.`,
        dataClassification: "INTERNAL",
        dedupeKey: `transport-${trip.id}-${link.studentId}-${guardianUser.id}`,
      });
    }
  }

  revalidatePath("/portal/transport");
  return { ok: true, message: `Trip attendance recorded for ${parsedRecords.length} student(s).` };
}
