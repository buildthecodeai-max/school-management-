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

const payrollSchema = z.object({
  campusId: z.string().min(1),
  staffId: z.string().min(1),
  periodLabel: z.string().min(1),
  grossPay: z.coerce.number().min(0),
  netPay: z.coerce.number().min(0),
  notes: z.string().optional(),
});

export async function recordPayrollInput(
  _prev: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const ctx = await requireUser();
  const parsed = payrollSchema.safeParse({
    campusId: formData.get("campusId"),
    staffId: formData.get("staffId"),
    periodLabel: formData.get("periodLabel"),
    grossPay: formData.get("grossPay"),
    netPay: formData.get("netPay"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { campusId, staffId, periodLabel, grossPay, netPay, notes } = parsed.data;
  if (!canForCampus(ctx, "hr.payroll.write", campusId)) return { error: "Permission denied." };

  const entry = await prisma.payrollInput.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      staffId,
      periodLabel,
      grossPay: Math.round(grossPay * 100),
      deductions: [],
      netPay: Math.round(netPay * 100),
      notes,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "hr.payroll.recorded",
    targetType: "PayrollInput",
    targetId: entry.id,
    campusId,
    metadata: { staffId, periodLabel },
  });

  revalidatePath("/portal/hr");
  return { ok: true, message: "Payroll entry recorded." };
}

// ---- Separation checklist --------------------------------------------------

const separationSchema = z.object({
  campusId: z.string().min(1),
  staffId: z.string().min(1),
  reason: z.string().min(1),
  lastWorkDay: z.string().min(1),
});

export async function initiateSeparation(
  _prev: HrActionState,
  formData: FormData,
): Promise<HrActionState> {
  const ctx = await requireUser();
  const parsed = separationSchema.safeParse({
    campusId: formData.get("campusId"),
    staffId: formData.get("staffId"),
    reason: formData.get("reason"),
    lastWorkDay: formData.get("lastWorkDay"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { campusId, staffId, reason, lastWorkDay } = parsed.data;
  if (!canForCampus(ctx, "hr.separation.manage", campusId)) return { error: "Permission denied." };

  const defaultItems = [
    { label: "Access cards returned", done: false },
    { label: "IT access revoked", done: false },
    { label: "Final payroll processed", done: false },
    { label: "Exit interview completed", done: false },
    { label: "Clearance certificate issued", done: false },
  ];

  const checklist = await prisma.separationChecklist.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      staffId,
      reason,
      lastWorkDay: new Date(lastWorkDay),
      items: defaultItems,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "hr.separation.initiated",
    targetType: "SeparationChecklist",
    targetId: checklist.id,
    campusId,
    metadata: { staffId, reason },
  });

  revalidatePath("/portal/hr");
  return { ok: true, message: "Separation checklist created." };
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
