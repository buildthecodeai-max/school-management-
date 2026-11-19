"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export interface HrActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// ---- Leave approval (reuses ATT-005 LeaveRequest model) -------------------

export async function approveLeaveHr(
  _prev: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const ctx = await requireUser();
  const leaveRequestId = String(formData.get("leaveRequestId") ?? "");
  const decision = formData.get("decision") as "APPROVED" | "REJECTED";
  const campusId = String(formData.get("campusId") ?? "");
  if (!canForCampus(ctx, "hr.leave.approve", campusId)) {
    return { error: "Permission denied." };
  }

  const req = await prisma.leaveRequest.findFirst({
    where: { id: leaveRequestId, tenantId: ctx.tenantId! },
    include: { staff: { include: { person: { include: { user: true } } } } },
  });
  if (!req) return { error: "Leave request not found." };
  if (req.status !== "PENDING") return { error: "Leave request is not pending." };

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: decision, reviewedByUserId: ctx.user.id, reviewedAt: new Date() },
    });
    if (decision === "APPROVED" && req.staffId) {
      await tx.leaveBalance.updateMany({
        where: { tenantId: ctx.tenantId!, personId: req.personId, leaveTypeId: req.leaveTypeId },
        data: { usedDays: { increment: req.days } },
      });
    }
  });

  const recipientUser = req.staff?.person?.user;
  if (recipientUser) {
    await notify({
      tenantId: ctx.tenantId!,
      recipientUserId: recipientUser.id,
      category: "ANNOUNCEMENT",
      title: `Leave request ${decision.toLowerCase()}`,
      body: `Your ${req.days}-day leave request has been ${decision.toLowerCase()}.`,
      dedupeKey: `leave:${leaveRequestId}:${decision}`,
    });
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: `hr.leave.${decision.toLowerCase()}`,
    targetType: "LeaveRequest",
    targetId: leaveRequestId,
    campusId,
    metadata: { decision },
  });

  revalidatePath("/portal/hr");
  return { ok: true, message: `Leave ${decision.toLowerCase()}.` };
}

// ---- Payroll data entry ----------------------------------------------------

// ---- Separation checklist --------------------------------------------------

const SEPARATION_ITEMS = [
  "Access cards returned",
  "IT access revoked",
  "Final payroll processed",
  "Exit interview completed",
  "Clearance certificate issued",
];
type SepItem = { label: string; done: boolean; doneAt?: string; doneBy?: string };
const sstr = (f: FormData, k: string, max = 300) => String(f.get(k) ?? "").trim().slice(0, max);

export async function initiateSeparation(_p: HrActionState, f: FormData): Promise<HrActionState> {
  const ctx = await requireUser();
  const staffId = sstr(f, "staffId", 40);
  // The campus is where the person currently works, not what the form claims.
  const employment = await prisma.employmentRecord.findFirst({ where: { tenantId: ctx.tenantId!, staffId, endDate: null }, orderBy: { startDate: "desc" } });
  if (!employment) return { error: "That person is not currently employed here." };
  const campusId = employment.campusId;
  if (!canForCampus(ctx, "hr.separation.manage", campusId)) return { error: "Permission denied." };
  const reason = sstr(f, "reason", 300);
  if (reason.length < 3) return { error: "Give the reason for leaving." };
  const last = /^\d{4}-\d{2}-\d{2}$/.test(sstr(f, "lastWorkDay", 10)) ? new Date(`${sstr(f, "lastWorkDay", 10)}T00:00:00.000Z`) : null;
  if (!last || Number.isNaN(last.getTime())) return { error: "Enter the last working day." };
  if (await prisma.separationChecklist.findFirst({ where: { tenantId: ctx.tenantId!, staffId, completedAt: null } })) return { error: "There is already an open separation checklist for this person." };

  const checklist = await prisma.separationChecklist.create({ data: { tenantId: ctx.tenantId!, campusId, staffId, reason, lastWorkDay: last, items: SEPARATION_ITEMS.map((label) => ({ label, done: false })) } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "hr.separation.initiated", targetType: "SeparationChecklist", targetId: checklist.id, campusId, scopeType: "CAMPUS", metadata: { staffId } });
  revalidatePath("/portal/hr");
  return { ok: true, message: "Separation checklist created." };
}

/** Tick (or untick) one item of an open checklist. */
export async function toggleSeparationItem(_p: HrActionState, f: FormData): Promise<HrActionState> {
  const ctx = await requireUser();
  const c = await prisma.separationChecklist.findFirst({ where: { id: sstr(f, "checklistId", 40), tenantId: ctx.tenantId! } });
  if (!c) return { error: "Checklist not found." };
  if (!canForCampus(ctx, "hr.separation.manage", c.campusId)) return { error: "Permission denied." };
  if (c.completedAt) return { error: "This checklist is already complete." };
  const items = c.items as SepItem[];
  const i = Number(f.get("index"));
  if (!Number.isInteger(i) || i < 0 || i >= items.length) return { error: "Item not found." };
  const next = items.map((it, j) => (j === i ? (it.done ? { label: it.label, done: false } : { label: it.label, done: true, doneAt: new Date().toISOString(), doneBy: ctx.user.id }) : it));
  await prisma.separationChecklist.update({ where: { id: c.id }, data: { items: next } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "hr.separation.item", targetType: "SeparationChecklist", targetId: c.id, campusId: c.campusId, scopeType: "CAMPUS", metadata: { item: items[i].label, done: !items[i].done } });
  revalidatePath("/portal/hr");
  return { ok: true, message: next[i].done ? "Ticked." : "Unticked." };
}

/** Close a checklist once every item is done. */
export async function completeSeparation(_p: HrActionState, f: FormData): Promise<HrActionState> {
  const ctx = await requireUser();
  const c = await prisma.separationChecklist.findFirst({ where: { id: sstr(f, "checklistId", 40), tenantId: ctx.tenantId! } });
  if (!c) return { error: "Checklist not found." };
  if (!canForCampus(ctx, "hr.separation.manage", c.campusId)) return { error: "Permission denied." };
  if (c.completedAt) return { error: "This checklist is already complete." };
  const open = (c.items as SepItem[]).filter((i) => !i.done).length;
  if (open > 0) return { error: `${open} item(s) are still open.` };
  const done = await prisma.separationChecklist.updateMany({ where: { id: c.id, completedAt: null }, data: { completedAt: new Date() } });
  if (done.count === 0) return { error: "This checklist is already complete." };
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "hr.separation.completed", targetType: "SeparationChecklist", targetId: c.id, campusId: c.campusId, scopeType: "CAMPUS", metadata: { staffId: c.staffId } });
  revalidatePath("/portal/hr");
  return { ok: true, message: "Separation completed." };
}

// ---- Add staff member -------------------------------------------------------

const addStaffSchema = z.object({
  campusId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  employeeNumber: z.string().min(1),
  positionId: z.string().min(1),
  contractType: z.enum(["PERMANENT", "TEMPORARY", "PART_TIME", "CONTRACT"]),
  salary: z.coerce.number().int().min(0),
  startDate: z.string().min(1),
});

export async function addStaff(
  _prev: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const ctx = await requireUser();
  const parsed = addStaffSchema.safeParse({
    campusId: formData.get("campusId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email") ?? "",
    gender: formData.get("gender"),
    employeeNumber: formData.get("employeeNumber"),
    positionId: formData.get("positionId"),
    contractType: formData.get("contractType"),
    salary: formData.get("salary"),
    startDate: formData.get("startDate"),
  });
  if (!parsed.success) return { error: "Invalid form data: " + parsed.error.issues[0]?.message };

  const { campusId, firstName, lastName, email, gender, employeeNumber, positionId, contractType, salary, startDate } = parsed.data;
  if (!canForCampus(ctx, "hr.staff.read", campusId)) return { error: "Permission denied." };

  // Check unique employee number
  const existing = await prisma.staff.findFirst({
    where: { tenantId: ctx.tenantId!, employeeNumber },
  });
  if (existing) return { error: `Employee number "${employeeNumber}" already exists.` };

  const person = await prisma.person.create({
    data: {
      tenantId: ctx.tenantId!,
      firstName,
      lastName,
      gender,
      email: email || null,
    },
  });

  const staff = await prisma.staff.create({
    data: {
      tenantId: ctx.tenantId!,
      personId: person.id,
      employeeNumber,
      title: "",
    },
  });

  await prisma.employmentRecord.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      staffId: staff.id,
      positionId,
      startDate: new Date(startDate),
      contractType,
      salary,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "hr.staff.added",
    targetType: "Staff",
    targetId: staff.id,
    campusId,
    metadata: { employeeNumber, firstName, lastName },
  });

  revalidatePath("/portal/hr");
  return { ok: true, message: `${firstName} ${lastName} added as staff.` };
}
