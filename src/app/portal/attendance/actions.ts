"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { dayStart } from "@/lib/dates";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { emitWebhook } from "@/lib/webhooks";

const markSchema = z.object({
  sectionId: z.string().min(1),
  submit: z.enum(["draft", "submit"]),
  // marks arrive as JSON: { [studentId]: codeId }
  marks: z.string(),
});

export interface AttendanceActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export async function saveAttendance(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const ctx = await requireUser();
  const parsed = markSchema.safeParse({
    sectionId: formData.get("sectionId"),
    submit: formData.get("submit"),
    marks: formData.get("marks"),
  });
  if (!parsed.success) return { error: "Invalid submission" };

  const { sectionId, submit } = parsed.data;
  let marks: Record<string, string>;
  try {
    marks = JSON.parse(parsed.data.marks);
  } catch {
    return { error: "Could not read the register" };
  }

  const section = await prisma.section.findFirst({
    where: { id: sectionId, tenantId: ctx.tenantId! },
  });
  if (!section) return { error: "Section not found" };

  // Authorization: must have attendance.write on this campus.
  if (!canForCampus(ctx, "attendance.write", section.campusId)) {
    await audit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.user.id,
      action: "attendance.save",
      outcome: "DENIED",
      campusId: section.campusId,
      scopeType: "CAMPUS",
      metadata: { sectionId },
    });
    return { error: "You do not have permission to record attendance here." };
  }

  const today = dayStart();

  // Idempotent session upsert on (sectionId, date, period).
  const existing = await prisma.attendanceSession.findUnique({
    where: {
      sectionId_date_period: { sectionId, date: today, period: "DAY" },
    },
  });

  // Locked sessions require the privileged amend permission.
  if (
    existing?.status === "LOCKED" &&
    !canForCampus(ctx, "attendance.amend", section.campusId)
  ) {
    return {
      error: "This register is locked. Amending it requires approval rights.",
    };
  }

  const staff = ctx.user.person
    ? await prisma.staff.findUnique({ where: { personId: ctx.user.person.id } })
    : null;

  const session = existing
    ? await prisma.attendanceSession.update({
        where: { id: existing.id },
        data: {
          status: submit === "submit" ? "SUBMITTED" : existing.status === "LOCKED" ? "LOCKED" : "DRAFT",
          submittedAt: submit === "submit" ? new Date() : existing.submittedAt,
        },
      })
    : await prisma.attendanceSession.create({
        data: {
          tenantId: ctx.tenantId!,
          campusId: section.campusId,
          sectionId,
          date: today,
          period: "DAY",
          status: submit === "submit" ? "SUBMITTED" : "DRAFT",
          takenByStaffId: staff?.id ?? null,
          submittedAt: submit === "submit" ? new Date() : null,
        },
      });

  // Upsert each record idempotently.
  const entries = Object.entries(marks);
  for (const [studentId, codeId] of entries) {
    if (!codeId) continue;
    await prisma.attendanceRecord.upsert({
      where: { sessionId_studentId: { sessionId: session.id, studentId } },
      create: {
        tenantId: ctx.tenantId!,
        sessionId: session.id,
        studentId,
        codeId,
      },
      update: { codeId },
    });
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: submit === "submit" ? "attendance.submit" : "attendance.draft",
    targetType: "AttendanceSession",
    targetId: session.id,
    campusId: section.campusId,
    scopeType: "CAMPUS",
    metadata: { count: entries.length },
  });

  // Guardian alerts on submit (ATT-003): notify for qualifying codes,
  // deduplicated per session.
  if (submit === "submit") {
    await generateGuardianAlerts(session.id, ctx.tenantId!);
    await emitWebhook(ctx.tenantId!, "attendance.session.submitted", {
      sessionId: session.id,
      sectionId,
      campusId: section.campusId,
      date: session.date.toISOString(),
      recordCount: entries.length,
    });
  }

  revalidatePath(`/portal/attendance/${sectionId}`);
  revalidatePath("/portal/attendance");
  return {
    ok: true,
    message:
      submit === "submit"
        ? "Attendance submitted. Guardian alerts queued for absences and lates."
        : "Draft saved.",
  };
}

async function generateGuardianAlerts(sessionId: string, tenantId: string) {
  const records = await prisma.attendanceRecord.findMany({
    where: { sessionId, code: { notifyGuardian: true } },
    include: {
      code: true,
      session: true,
      student: {
        include: {
          person: true,
          guardianLinks: {
            where: { receivesNotifications: true },
            include: { guardian: { include: { person: { include: { user: true } } } } },
          },
        },
      },
    },
  });

  for (const rec of records) {
    for (const link of rec.student.guardianLinks) {
      const user = link.guardian.person.user;
      if (!user) continue;
      // Dedup key ensures the same session+student+code never double-alerts
      // a guardian, even if attendance is resubmitted (ATT-003, NTF-001).
      await notify({
        tenantId,
        recipientUserId: user.id,
        category: "ATTENDANCE",
        title: `${rec.code.label} — ${rec.student.person.firstName}`,
        body: `${rec.student.person.firstName} ${rec.student.person.lastName} was marked "${rec.code.label}" on ${rec.session.date.toLocaleDateString()}.`,
        relatedType: "attendance",
        relatedId: sessionId,
        dedupeKey: `attendance:${sessionId}:${rec.studentId}:${rec.codeId}`,
      });
    }
  }
}
