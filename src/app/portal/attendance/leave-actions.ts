"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canForCampus, requireUser } from "@/lib/rbac";
import { notify } from "@/lib/notify";

export interface StudentLeaveDecisionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const str = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

/** Staff approve or reject a student's leave request (attendance.leave.approve on the campus). */
export async function decideStudentLeave(_p: StudentLeaveDecisionState, f: FormData): Promise<StudentLeaveDecisionState> {
  const ctx = await requireUser();
  const req = await prisma.leaveRequest.findFirst({
    where: { id: str(f, "requestId", 40), tenantId: ctx.tenantId!, staffId: null },
    include: { person: { include: { student: true } }, leaveType: true },
  });
  const student = req?.person.student;
  if (!req || !student) return { error: "Student leave request not found." };
  if (!canForCampus(ctx, "attendance.leave.approve", req.campusId)) return { error: "Permission denied." };
  const to = str(f, "decision", 10);
  if (to !== "APPROVED" && to !== "REJECTED") return { error: "Choose approve or reject." };
  const note = str(f, "note", 300);
  if (to === "REJECTED" && note.length < 3) return { error: "Tell the family why it was declined." };

  const done = await prisma.leaveRequest.updateMany({ where: { id: req.id, status: "PENDING" }, data: { status: to, reviewedByUserId: ctx.user.id, reviewNote: note || null, reviewedAt: new Date() } });
  if (done.count === 0) return { error: "This request was already decided or cancelled." };
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `student.leave.${to === "APPROVED" ? "approved" : "rejected"}`, targetType: "LeaveRequest", targetId: req.id, campusId: req.campusId, scopeType: "CAMPUS", metadata: { studentId: student.id, ...(note ? { note } : {}) } });

  const guardians = await prisma.guardianRelationship.findMany({ where: { tenantId: ctx.tenantId!, studentId: student.id, receivesNotifications: true }, include: { guardian: { include: { person: { include: { user: true } } } } } });
  for (const g of guardians) {
    const u = g.guardian.person.user;
    if (!u) continue;
    await notify({ tenantId: ctx.tenantId!, recipientUserId: u.id, category: "ATTENDANCE", title: `Leave ${to === "APPROVED" ? "approved" : "declined"}`, body: `${req.person.firstName}'s ${req.leaveType.name} request (${req.startDate.toISOString().slice(0, 10)} to ${req.endDate.toISOString().slice(0, 10)}) was ${to === "APPROVED" ? "approved" : "declined"}.${note ? ` ${note}` : ""}`, relatedType: "leave", relatedId: req.id, dedupeKey: `studentleave:decided:${req.id}:${u.id}` });
  }
  revalidatePath("/portal/attendance/leave");
  return { ok: true, message: to === "APPROVED" ? "Approved. The register will show these days as leave." : "Declined and the family was told." };
}
