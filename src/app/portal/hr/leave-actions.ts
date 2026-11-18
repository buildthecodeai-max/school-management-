"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canForCampus, requireUser } from "@/lib/rbac";
import { daysBetweenInclusive, rangesOverlap, remainingDays, validDaysRequested } from "@/lib/leave";

export interface LeaveState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const day = (v: string) => {
  const d = new Date(`${v}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

// ATT-005: a staff member requests leave. The server decides everything that
// matters (who they are, which campus, entitlement, overlaps); the form only
// supplies the choice of leave type, dates, days and reason.
export async function submitLeaveRequest(_p: LeaveState, f: FormData): Promise<LeaveState> {
  const ctx = await requireUser();
  if (!ctx.tenantId || !ctx.user.personId) return { error: "Your account has no staff profile, so it cannot request leave." };
  const staff = await prisma.staff.findFirst({ where: { personId: ctx.user.personId, tenantId: ctx.tenantId } });
  if (!staff) return { error: "Your account is not linked to a staff record." };

  const campusId = str(f, "campusId");
  const employed = await prisma.employmentRecord.findFirst({ where: { staffId: staff.id, campusId, endDate: null } });
  if (!employed || !canForCampus(ctx, "attendance.leave.request", campusId)) return { error: "You cannot request leave for that campus." };

  const type = await prisma.leaveType.findFirst({ where: { id: str(f, "leaveTypeId"), tenantId: ctx.tenantId, appliesTo: { in: ["STAFF", "BOTH"] } } });
  if (!type) return { error: "Choose a leave type." };
  const start = day(str(f, "startDate")), end = day(str(f, "endDate"));
  if (!start || !end || end < start) return { error: "The end date cannot be before the start date." };
  const days = Number(str(f, "days"));
  const invalid = validDaysRequested(days, daysBetweenInclusive(start, end));
  if (invalid) return { error: invalid };

  const open = await prisma.leaveRequest.findMany({ where: { tenantId: ctx.tenantId, personId: ctx.user.personId, status: { in: ["PENDING", "APPROVED"] } } });
  if (open.some((r) => rangesOverlap(start, end, r.startDate, r.endDate))) return { error: "You already have leave requested or approved that overlaps these dates." };

  const balance = await prisma.leaveBalance.findFirst({ where: { tenantId: ctx.tenantId, personId: ctx.user.personId, leaveTypeId: type.id, academicYearId: null } });
  const pending = open.filter((r) => r.leaveTypeId === type.id && r.status === "PENDING").reduce((s, r) => s + r.days, 0);
  const left = remainingDays(balance?.totalDays ?? type.daysPerYear, balance?.usedDays ?? 0, pending);
  if (left !== null && days > left) return { error: `You have ${left} day(s) of ${type.name} left, including requests awaiting approval.` };

  const req = await prisma.$transaction(async (tx) => {
    if (!balance)
      await tx.leaveBalance.create({ data: { tenantId: ctx.tenantId!, personId: ctx.user.personId!, leaveTypeId: type.id, totalDays: type.daysPerYear, usedDays: 0 } });
    return tx.leaveRequest.create({
      data: { tenantId: ctx.tenantId!, campusId, personId: ctx.user.personId!, staffId: staff.id, leaveTypeId: type.id, startDate: start, endDate: end, days, reason: str(f, "reason") || null },
    });
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "leave.requested", targetType: "LeaveRequest", targetId: req.id, campusId, scopeType: "CAMPUS", metadata: { type: type.name, days } });
  revalidatePath("/portal/hr/leave");
  return { ok: true, message: "Leave request submitted for approval." };
}

export async function cancelLeaveRequest(_p: LeaveState, f: FormData): Promise<LeaveState> {
  const ctx = await requireUser();
  const req = ctx.tenantId && ctx.user.personId ? await prisma.leaveRequest.findFirst({ where: { id: str(f, "id"), tenantId: ctx.tenantId, personId: ctx.user.personId } }) : null;
  if (!req) return { error: "Leave request not found." };
  if (req.status !== "PENDING") return { error: "Only a request that is still pending can be cancelled." };
  await prisma.leaveRequest.update({ where: { id: req.id }, data: { status: "CANCELLED" } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "leave.cancelled", targetType: "LeaveRequest", targetId: req.id, campusId: req.campusId, scopeType: "CAMPUS" });
  revalidatePath("/portal/hr/leave");
  return { ok: true, message: "Leave request cancelled." };
}
