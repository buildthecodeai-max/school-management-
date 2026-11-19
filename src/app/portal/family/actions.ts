"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser } from "@/lib/rbac";
import { notify } from "@/lib/notify";
import { familyAccess } from "@/lib/family";
import { daysBetweenInclusive, rangesOverlap } from "@/lib/leave";

export interface FamilyActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const str = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);
const utcDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : d;
};
const todayUtc = () => utcDay(new Date().toISOString().slice(0, 10))!;
const MAX_STUDENT_LEAVE_DAYS = 60;

/** A guardian reports an absence or asks for leave for their child. Staff decide. */
export async function requestStudentLeave(_p: FamilyActionState, f: FormData): Promise<FamilyActionState> {
  const ctx = await requireUser();
  const studentId = str(f, "studentId", 40);
  const link = await familyAccess(ctx, studentId);
  if (!link || link.relation !== "guardian") return { error: "Only a parent or guardian linked to this student can request leave." };

  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: ctx.tenantId! }, include: { person: true } });
  const enrollment = await prisma.enrollment.findFirst({ where: { studentId, tenantId: ctx.tenantId!, status: "ACTIVE" }, orderBy: { startDate: "desc" } });
  if (!student || !enrollment) return { error: "This student is not currently enrolled." };

  const type = await prisma.leaveType.findFirst({ where: { id: str(f, "leaveTypeId", 40), tenantId: ctx.tenantId!, appliesTo: { in: ["STUDENT", "BOTH"] } } });
  if (!type) return { error: "Choose a leave type." };
  const start = utcDay(str(f, "startDate")), end = utcDay(str(f, "endDate"));
  if (!start || !end) return { error: "Enter both dates." };
  if (end < start) return { error: "The end date cannot be before the start date." };
  const today = todayUtc();
  if (start.getTime() < today.getTime() - 7 * 86_400_000) return { error: "Leave cannot start more than a week in the past. Contact the school office." };
  if (start.getTime() > today.getTime() + 180 * 86_400_000) return { error: "Leave cannot start more than 6 months ahead." };
  const days = daysBetweenInclusive(start, end);
  if (days > MAX_STUDENT_LEAVE_DAYS) return { error: `Leave is limited to ${MAX_STUDENT_LEAVE_DAYS} days at a time. Contact the school office for longer absences.` };
  const reason = str(f, "reason", 500);
  if (reason.length < 3) return { error: "Tell the school why." };

  const clash = await prisma.leaveRequest.findMany({ where: { tenantId: ctx.tenantId!, personId: student.personId, status: { in: ["PENDING", "APPROVED"] } } });
  if (clash.some((r) => rangesOverlap(start, end, r.startDate, r.endDate))) return { error: "There is already a pending or approved request on those dates." };

  const req = await prisma.leaveRequest.create({ data: { tenantId: ctx.tenantId!, campusId: enrollment.campusId, personId: student.personId, leaveTypeId: type.id, startDate: start, endDate: end, days, reason } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "student.leave.requested", targetType: "LeaveRequest", targetId: req.id, campusId: enrollment.campusId, scopeType: "CAMPUS", metadata: { studentId, days } });

  // Tell the people who can decide it.
  const approvers = await prisma.roleAssignment.findMany({
    where: { user: { tenantId: ctx.tenantId! }, role: { permissions: { has: "attendance.leave.approve" } }, OR: [{ scopeType: "ORG" }, { campusId: enrollment.campusId }] },
    select: { userId: true },
  });
  for (const userId of new Set(approvers.map((a) => a.userId))) {
    await notify({ tenantId: ctx.tenantId!, recipientUserId: userId, category: "ATTENDANCE", title: "Student leave request", body: `${student.person.firstName} ${student.person.lastName}: ${type.name}, ${days} day(s). Review it under Attendance → Student leave.`, relatedType: "leave", relatedId: req.id, dedupeKey: `studentleave:${req.id}:${userId}` });
  }
  revalidatePath(`/portal/family/${studentId}`);
  return { ok: true, message: "Request sent to the school. You will be notified of the decision." };
}

export async function cancelStudentLeave(_p: FamilyActionState, f: FormData): Promise<FamilyActionState> {
  const ctx = await requireUser();
  const req = await prisma.leaveRequest.findFirst({ where: { id: str(f, "requestId", 40), tenantId: ctx.tenantId! }, include: { person: { include: { student: true } } } });
  const studentId = req?.person.student?.id;
  const link = studentId ? await familyAccess(ctx, studentId) : null;
  if (!req || !studentId || link?.relation !== "guardian") return { error: "Request not found." };
  const cancelled = await prisma.leaveRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (cancelled.count === 0) return { error: "Only a pending request can be cancelled." };
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "student.leave.cancelled", targetType: "LeaveRequest", targetId: req.id, campusId: req.campusId, scopeType: "CAMPUS" });
  revalidatePath(`/portal/family/${studentId}`);
  return { ok: true, message: "Request cancelled." };
}
