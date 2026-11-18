"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { dayStart } from "@/lib/dates";
import { parseDay, formatDay, checkRegisterDate, diffMarks } from "@/lib/attendance";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { emitWebhook } from "@/lib/webhooks";

const markSchema = z.object({
  sectionId: z.string().min(1),
  submit: z.enum(["draft", "submit"]),
  // marks arrive as JSON: { [studentId]: codeId }
  marks: z.string(),
  date: z.string().optional(),
  reason: z.string().trim().max(500).optional(),
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
    date: formData.get("date") || undefined,
    reason: formData.get("reason") || undefined,
  });
  if (!parsed.success) return { error: "Invalid submission" };

  const { sectionId, submit, reason } = parsed.data;
  let marks: Record<string, string>;
  try {
    marks = JSON.parse(parsed.data.marks);
    if (!marks || typeof marks !== "object" || Array.isArray(marks)) throw new Error();
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
  const canAmend = canForCampus(ctx, "attendance.amend", section.campusId);

  const today = dayStart();
  const date = parsed.data.date ? parseDay(parsed.data.date) : today;
  if (!date) return { error: "Choose a valid date." };
  const dateCheck = checkRegisterDate(date, today, canAmend);
  if (!dateCheck.ok) return { error: dateCheck.error };

  // Marks may only name students enrolled in this section and codes of this school.
  const [enrolled, codes] = await Promise.all([
    prisma.enrollment.findMany({
      where: { tenantId: ctx.tenantId!, sectionId, status: "ACTIVE" },
      select: { studentId: true },
    }),
    prisma.attendanceCode.findMany({ where: { tenantId: ctx.tenantId! }, select: { id: true } }),
  ]);
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));
  const codeIds = new Set(codes.map((c) => c.id));
  for (const [studentId, codeId] of Object.entries(marks)) {
    if (!codeId) continue;
    if (!enrolledIds.has(studentId)) return { error: "The register includes a student who is not in this section." };
    if (!codeIds.has(codeId)) return { error: "The register uses an unknown attendance code." };
  }
  if (submit === "submit") {
    const missing = [...enrolledIds].filter((id) => !marks[id]).length;
    if (missing > 0) return { error: `${missing} student${missing === 1 ? " has" : "s have"} no mark yet. Mark everyone before submitting.` };
  }

  const existing = await prisma.attendanceSession.findUnique({
    where: { sectionId_date_period: { sectionId, date, period: "DAY" } },
    include: { records: true },
  });
  const existingMarks: Record<string, string> = {};
  existing?.records.forEach((r) => (existingMarks[r.studentId] = r.codeId));

  // After submission every change is an amendment: privileged, explained, logged.
  const afterSubmit = existing?.status === "SUBMITTED" || existing?.status === "LOCKED";
  const changes = diffMarks(existingMarks, marks);
  if (afterSubmit && changes.length > 0) {
    if (!canAmend) {
      return {
        error:
          existing!.status === "LOCKED"
            ? "This register is locked. Amending it requires approval rights."
            : "This register has been submitted. Changing it requires amend rights.",
      };
    }
    if (!reason || reason.length < 5) return { error: "Give a reason (at least 5 characters) for amending a submitted register." };
  }

  const staff = ctx.user.person
    ? await prisma.staff.findUnique({ where: { personId: ctx.user.person.id } })
    : null;

  const nextStatus = afterSubmit ? existing!.status : submit === "submit" ? "SUBMITTED" : "DRAFT";

  const session = await prisma.$transaction(async (tx) => {
    const sess = existing
      ? await tx.attendanceSession.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            submittedAt: submit === "submit" && !existing.submittedAt ? new Date() : existing.submittedAt,
          },
        })
      : await tx.attendanceSession.create({
          data: {
            tenantId: ctx.tenantId!,
            campusId: section.campusId,
            sectionId,
            date,
            period: "DAY",
            status: nextStatus,
            takenByStaffId: staff?.id ?? null,
            submittedAt: submit === "submit" ? new Date() : null,
          },
        });
    for (const ch of changes) {
      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId: sess.id, studentId: ch.studentId } },
        create: { tenantId: ctx.tenantId!, sessionId: sess.id, studentId: ch.studentId, codeId: ch.toCodeId },
        update: { codeId: ch.toCodeId },
      });
      if (afterSubmit) {
        await tx.attendanceAmendment.create({
          data: {
            tenantId: ctx.tenantId!,
            sessionId: sess.id,
            studentId: ch.studentId,
            fromCodeId: ch.fromCodeId,
            toCodeId: ch.toCodeId,
            reason: reason!,
            actorUserId: ctx.user.id,
          },
        });
      }
    }
    return sess;
  });

  if (!afterSubmit || changes.length > 0) await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: afterSubmit ? "attendance.amend" : submit === "submit" ? "attendance.submit" : "attendance.draft",
    targetType: "AttendanceSession",
    targetId: session.id,
    campusId: section.campusId,
    scopeType: "CAMPUS",
    metadata: { changed: changes.length, date: formatDay(date), ...(afterSubmit ? { reason } : {}) },
  });

  // Guardian alerts (ATT-003): on submit and after amendments; deduplicated per
  // session+student+code so resubmitting never double-alerts.
  if (submit === "submit" || (afterSubmit && changes.length > 0)) {
    await generateGuardianAlerts(session.id, ctx.tenantId!);
  }
  if (submit === "submit" && !afterSubmit) {
    await emitWebhook(ctx.tenantId!, "attendance.session.submitted", {
      sessionId: session.id,
      sectionId,
      campusId: section.campusId,
      date: session.date.toISOString(),
      recordCount: Object.keys(marks).length,
    });
  }

  revalidatePath(`/portal/attendance/${sectionId}`);
  revalidatePath("/portal/attendance");
  return {
    ok: true,
    message: afterSubmit
      ? changes.length > 0
        ? `Register amended (${changes.length} change${changes.length === 1 ? "" : "s"} recorded).`
        : "No changes to save."
      : submit === "submit"
        ? "Attendance submitted. Guardian alerts queued for absences and lates."
        : "Draft saved.",
  };
}

/** Freeze a submitted register: from now on only amend-rights holders can change it. */
export async function lockAttendanceRegister(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const ctx = await requireUser();
  const sessionId = String(formData.get("sessionId") ?? "");
  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: ctx.tenantId! },
  });
  if (!session) return { error: "Register not found" };
  if (!canForCampus(ctx, "attendance.amend", session.campusId)) {
    return { error: "You do not have permission to lock registers here." };
  }
  if (session.status !== "SUBMITTED") return { error: "Only a submitted register can be locked." };
  await prisma.attendanceSession.update({
    where: { id: session.id },
    data: { status: "LOCKED", lockedAt: new Date() },
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "attendance.lock",
    targetType: "AttendanceSession",
    targetId: session.id,
    campusId: session.campusId,
    scopeType: "CAMPUS",
  });
  revalidatePath(`/portal/attendance/${session.sectionId}`);
  return { ok: true, message: "Register locked." };
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
