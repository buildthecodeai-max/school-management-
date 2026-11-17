"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function saveStaffAttendance(formData: FormData) {
  const ctx = await requireUser();
  const campusId = String(formData.get("campusId"));
  const dateStr = String(formData.get("date"));
  if (!campusId || !dateStr) throw new Error("Missing campusId or date.");
  if (!canForCampus(ctx, "hr.staff.write", campusId))
    throw new Error("You need hr.staff.write permission to record staff attendance.");

  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);

  // Parse per-staff rows: status_<staffId>, note_<staffId>
  const updates: { staffId: string; status: string; note: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("status_")) {
      const staffId = key.slice(7);
      const note = String(formData.get(`note_${staffId}`) ?? "").trim();
      updates.push({ staffId, status: String(value), note });
    }
  }

  if (updates.length === 0) return;

  await prisma.$transaction(
    updates.map(({ staffId, status, note }) =>
      prisma.staffAttendanceRecord.upsert({
        where: { staffId_date: { staffId, date } },
        create: {
          tenantId: ctx.tenantId!,
          campusId,
          staffId,
          date,
          status,
          note: note || null,
          recordedByUserId: ctx.user.id,
        },
        update: {
          status,
          note: note || null,
          recordedByUserId: ctx.user.id,
        },
      })
    )
  );

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "hr.attendance.saved",
    targetType: "Campus",
    targetId: campusId,
    campusId,
    scopeType: "CAMPUS",
    metadata: { date: dateStr, count: updates.length },
  });

  revalidatePath("/portal/hr/attendance");
}
