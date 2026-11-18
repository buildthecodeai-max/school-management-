"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { toCents } from "@/lib/money";
import { effectiveSetting } from "@/lib/settings";
import {
  computeInvoiceFromStructure,
  buildInstallmentSchedule,
  nextInvoiceNumber,
  nextPaymentNumber,
  invNo,
  rcpNo,
  recomputeInvoice,
} from "@/lib/finance-server";

export type FeeSetupState = { ok?: boolean; error?: string; message?: string };

const FEE_CATEGORIES = ["TUITION", "TRANSPORT", "MEALS", "LAB", "ACTIVITY", "EXAM", "OTHER"] as const;

function canConfigureFeeHeads(ctx: Awaited<ReturnType<typeof requireUser>>) {
  return ctx.hasOrgScope
    ? canForCampus(ctx, "fee.configure", "")
    : ctx.campusIds.some((campusId) => canForCampus(ctx, "fee.configure", campusId));
}

function cleanFeeHead(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    code: String(formData.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-"),
    category: String(formData.get("category") ?? "OTHER"),
    taxRatePct: Number(formData.get("taxRatePct") ?? 0),
    glAccountCode: String(formData.get("glAccountCode") ?? "").trim() || null,
  };
}

export async function createFeeHead(_previous: FeeSetupState, formData: FormData): Promise<FeeSetupState> {
  const ctx = await requireUser();
  const input = cleanFeeHead(formData);
  if (!input.name || !input.code) return { error: "Name and code are required." };
  if (!FEE_CATEGORIES.includes(input.category as typeof FEE_CATEGORIES[number])) return { error: "Invalid fee category." };
  if (!Number.isInteger(input.taxRatePct) || input.taxRatePct < 0 || input.taxRatePct > 100) return { error: "Tax rate must be a whole number from 0 to 100." };
  if (!ctx.tenantId || !canConfigureFeeHeads(ctx)) return { error: "You do not have permission to configure fees." };
  const clash = await prisma.feeHead.findUnique({ where: { tenantId_code: { tenantId: ctx.tenantId, code: input.code } } });
  if (clash) return { error: `Fee head code ${input.code} already exists.` };
  const head = await prisma.feeHead.create({ data: { tenantId: ctx.tenantId, ...input, category: input.category as never } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.head.created", targetType: "FeeHead", targetId: head.id, scopeType: "ORG", metadata: input });
  revalidatePath("/portal/fees/structures");
  return { ok: true, message: `${head.name} created.` };
}

export async function updateFeeHead(_previous: FeeSetupState, formData: FormData): Promise<FeeSetupState> {
  const ctx = await requireUser();
  const id = String(formData.get("feeHeadId") ?? "");
  const input = cleanFeeHead(formData);
  if (!input.name || !input.code) return { error: "Name and code are required." };
  if (!FEE_CATEGORIES.includes(input.category as typeof FEE_CATEGORIES[number]) || !Number.isInteger(input.taxRatePct) || input.taxRatePct < 0 || input.taxRatePct > 100) return { error: "Invalid fee-head configuration." };
  if (!ctx.tenantId || !canConfigureFeeHeads(ctx)) return { error: "You do not have permission to configure fees." };
  const head = await prisma.feeHead.findFirst({ where: { id, tenantId: ctx.tenantId ?? "" } });
  if (!head) return { error: "Fee head not found." };
  const clash = await prisma.feeHead.findFirst({ where: { tenantId: ctx.tenantId!, code: input.code, id: { not: id } } });
  if (clash) return { error: `Fee head code ${input.code} already exists.` };
  await prisma.feeHead.update({ where: { id }, data: { ...input, category: input.category as never } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.head.updated", targetType: "FeeHead", targetId: id, scopeType: "ORG", metadata: { before: head, after: input } });
  revalidatePath("/portal/fees/structures");
  return { ok: true, message: "Fee head updated." };
}

export async function deleteFeeHead(_previous: FeeSetupState, formData: FormData): Promise<FeeSetupState> {
  const ctx = await requireUser();
  const id = String(formData.get("feeHeadId") ?? "");
  if (!ctx.tenantId || !canConfigureFeeHeads(ctx)) return { error: "You do not have permission to configure fees." };
  const head = await prisma.feeHead.findFirst({ where: { id, tenantId: ctx.tenantId ?? "" }, include: { _count: { select: { structureLines: true, invoiceLines: true } } } });
  if (!head) return { error: "Fee head not found." };
  if (head._count.structureLines || head._count.invoiceLines) return { error: "This fee head is in use and cannot be deleted. Keep it for historical invoices or remove it from unused draft structures first." };
  await prisma.feeHead.delete({ where: { id } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.head.deleted", targetType: "FeeHead", targetId: id, scopeType: "ORG", metadata: { name: head.name, code: head.code } });
  revalidatePath("/portal/fees/structures");
  return { ok: true, message: `${head.name} deleted.` };
}

export async function createFeeStructure(_previous: FeeSetupState, formData: FormData): Promise<FeeSetupState> {
  const ctx = await requireUser();
  const tenantId = ctx.tenantId;
  const name = String(formData.get("name") ?? "").trim();
  const campusId = String(formData.get("campusId") ?? "");
  const gradeLevelId = String(formData.get("gradeLevelId") ?? "") || null;
  const academicYearId = String(formData.get("academicYearId") ?? "") || null;
  const rawHeadIds = formData.getAll("feeHeadId").map(String);
  const rawAmounts = formData.getAll("amount").map(String);
  if (!tenantId || !name || !campusId) return { error: "Name, campus and class are required." };
  if (!canForCampus(ctx, "fee.configure", campusId)) return { error: "You cannot configure fees for this campus." };
  const lines = rawHeadIds.map((feeHeadId, index) => ({ feeHeadId, amount: toCents(rawAmounts[index] ?? "0") })).filter((line) => line.feeHeadId && line.amount > 0);
  if (!lines.length) return { error: "Add at least one fee head with a positive amount." };
  if (new Set(lines.map((line) => line.feeHeadId)).size !== lines.length) return { error: "A fee head can appear only once in a structure." };
  const effectiveToRaw = String(formData.get("effectiveTo") ?? "").trim();
  const effectiveTo = effectiveToRaw ? new Date(effectiveToRaw) : null;
  const [campus, grade, year, heads] = await Promise.all([
    prisma.campus.findFirst({ where: { id: campusId, tenantId } }),
    gradeLevelId ? prisma.gradeLevel.findFirst({ where: { id: gradeLevelId, tenantId, campusId } }) : Promise.resolve(null),
    academicYearId ? prisma.academicYear.findFirst({ where: { id: academicYearId, tenantId, campusId } }) : Promise.resolve(null),
    prisma.feeHead.findMany({ where: { tenantId, id: { in: lines.map((line) => line.feeHeadId) } } }),
  ]);
  if (!campus || (gradeLevelId && !grade) || (academicYearId && !year) || heads.length !== lines.length) return { error: "One or more selected campus, class, session or fee heads are invalid." };
  const structure = await prisma.feeStructure.create({ data: { tenantId, campusId, gradeLevelId, academicYearId, name, effectiveTo, lines: { create: lines.map((line) => ({ tenantId, feeHeadId: line.feeHeadId, amount: line.amount })) } } });
  await audit({ tenantId, actorUserId: ctx.user.id, action: "fee.structure.created", targetType: "FeeStructure", targetId: structure.id, campusId, scopeType: "CAMPUS", metadata: { name, gradeLevelId, academicYearId, lineCount: lines.length } });
  revalidatePath("/portal/fees/structures");
  revalidatePath("/portal/fees/billing");
  return { ok: true, message: `${name} created with ${lines.length} fee head${lines.length === 1 ? "" : "s"}.` };
}

export async function setFeeStructureActive(_previous: FeeSetupState, formData: FormData): Promise<FeeSetupState> {
  const ctx = await requireUser();
  const id = String(formData.get("feeStructureId") ?? "");
  const active = String(formData.get("active")) === "true";
  const structure = await prisma.feeStructure.findFirst({ where: { id, tenantId: ctx.tenantId ?? "" } });
  if (!structure || !canForCampus(ctx, "fee.configure", structure?.campusId ?? "")) return { error: "Fee structure not found or not in your campus scope." };
  await prisma.feeStructure.update({ where: { id }, data: { active } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: active ? "fee.structure.activated" : "fee.structure.deactivated", targetType: "FeeStructure", targetId: id, campusId: structure.campusId, scopeType: "CAMPUS" });
  revalidatePath("/portal/fees/structures");
  revalidatePath("/portal/fees/billing");
  return { ok: true, message: `Fee structure ${active ? "activated" : "deactivated"}.` };
}

// ---- Billing run (FEE-002, workflow §8.3) --------------------------------

export async function postBillingRun(formData: FormData) {
  const ctx = await requireUser();
  const feeStructureId = String(formData.get("feeStructureId"));
  const periodLabel = String(formData.get("periodLabel") || "").trim();
  const dueStr = String(formData.get("dueDate") || "");
  if (!periodLabel) throw new Error("A period label is required.");
  const dueDate = dueStr ? new Date(dueStr) : new Date(Date.now() + 30 * 864e5);

  const structure = await prisma.feeStructure.findFirst({
    where: { id: feeStructureId, tenantId: ctx.tenantId! },
    include: { lines: { include: { feeHead: true } } },
  });
  if (!structure) throw new Error("Fee structure not found");
  if (!canForCampus(ctx, "fee.bill", structure.campusId))
    throw new Error("You cannot run billing for this campus.");

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId: ctx.tenantId!,
      status: "ACTIVE",
      campusId: structure.campusId,
      ...(structure.gradeLevelId ? { gradeLevelId: structure.gradeLevelId } : {}),
    },
    include: { student: { include: { person: true, feeAssignments: true, guardianLinks: { where: { financiallyResponsible: true, receivesNotifications: true }, include: { guardian: { include: { person: { include: { user: true } } } } } } } } },
  });

  // Idempotency: skip students already invoiced for this structure+period.
  const existing = await prisma.invoice.findMany({
    where: { tenantId: ctx.tenantId!, feeStructureId, periodLabel },
    select: { studentId: true },
  });
  const done = new Set(existing.map((e) => e.studentId));

  const invPrefix = await effectiveSetting(ctx.tenantId!, structure.campusId, "invoice.prefix");
  let seq = await nextInvoiceNumber(ctx.tenantId!);
  let invoiceCount = 0;
  let totalAmount = 0;
  const guardianNotices: { userId: string; invoiceId: string; studentName: string; total: number }[] = [];

  await prisma.$transaction(async (tx) => {
    const run = await tx.billingRun.create({
      data: {
        tenantId: ctx.tenantId!,
        campusId: structure.campusId,
        feeStructureId,
        periodLabel,
        dueDate,
        approvedByUserId: ctx.user.id,
      },
    });

    for (const e of enrollments) {
      if (done.has(e.student.id)) continue;
      const assignment = e.student.feeAssignments.find(
        (a) => a.feeStructureId === feeStructureId,
      );
      const discountPct = assignment?.discountPct ?? 0;
      const fig = computeInvoiceFromStructure(structure.lines, discountPct);
      if (fig.total <= 0) continue;

      // FEE-001: If any fee structure line has installments, generate per-installment invoices.
      // We check the line with the most installments as the schedule driver.
      const maxInstallments = Math.max(...structure.lines.map((l) => l.installmentCount ?? 1));
      const isInstallment = maxInstallments > 1;

      if (isInstallment) {
        // Build combined schedule across all lines, merged by installment index
        const schedules = structure.lines.map((l) =>
          buildInstallmentSchedule(l.amount, l.installmentCount ?? 1, l.installmentPlan, dueDate),
        );
        for (let inst = 0; inst < maxInstallments; inst++) {
          const installDueDate = schedules.find((s) => s[inst])?.[ inst]?.dueDate ?? dueDate;
          const instLabel = `${periodLabel} — Installment ${inst + 1}/${maxInstallments}`;
          const instLines = structure.lines.map((l, li) => {
            const sched = schedules[li];
            const amount = sched[inst]?.amount ?? (inst === 0 ? l.amount : 0);
            return { feeHeadId: l.feeHeadId, amount, description: l.label ?? "" };
          });
          const instSubtotal = instLines.reduce((s, l) => s + l.amount, 0);
          const instDiscount = Math.round((instSubtotal * discountPct) / 100);
          const instTotal = instSubtotal - instDiscount;
          if (instTotal <= 0) continue;

          await tx.invoice.create({
            data: {
              tenantId: ctx.tenantId!,
              campusId: structure.campusId,
              studentId: e.student.id,
              feeStructureId,
              number: invNo(seq++, invPrefix),
              periodLabel: instLabel,
              dueDate: installDueDate,
              subtotal: instSubtotal,
              discountTotal: instDiscount,
              taxTotal: 0,
              total: instTotal,
              balance: instTotal,
              status: "OPEN",
              sourceRunId: run.id,
              lines: {
                create: instLines.map((l) => ({
                  tenantId: ctx.tenantId!,
                  feeHeadId: l.feeHeadId,
                  description: l.description,
                  amount: l.amount,
                  taxAmount: 0,
                })),
              },
            },
          });
          invoiceCount++;
          totalAmount += instTotal;
        }
        const gUser = e.student.guardianLinks[0]?.guardian.person.user;
        if (gUser) {
          guardianNotices.push({ userId: gUser.id, invoiceId: "", studentName: `${e.student.person.firstName} ${e.student.person.lastName}`, total: fig.total });
        }
        continue;
      }

      const createdInvoice = await tx.invoice.create({
        data: {
          tenantId: ctx.tenantId!,
          campusId: structure.campusId,
          studentId: e.student.id,
          feeStructureId,
          number: invNo(seq, invPrefix),
          periodLabel,
          dueDate,
          subtotal: fig.subtotal,
          discountTotal: fig.discountTotal,
          taxTotal: fig.taxTotal,
          total: fig.total,
          balance: fig.total,
          status: "OPEN",
          sourceRunId: run.id,
          lines: {
            create: structure.lines.map((l) => ({
              tenantId: ctx.tenantId!,
              feeHeadId: l.feeHeadId,
              description: l.label ?? l.feeHead.name,
              amount: l.amount,
              taxAmount: Math.round((l.amount * l.feeHead.taxRatePct) / 100),
            })),
          },
        },
      });
      seq++;
      invoiceCount++;
      totalAmount += fig.total;

      const gUser = e.student.guardianLinks[0]?.guardian.person.user;
      if (gUser) {
        guardianNotices.push({
          userId: gUser.id,
          invoiceId: createdInvoice.id,
          studentName: `${e.student.person.firstName} ${e.student.person.lastName}`,
          total: fig.total,
        });
      }
    }

    await tx.billingRun.update({
      where: { id: run.id },
      data: { invoiceCount, totalAmount },
    });
  });

  // Notify financially-responsible guardians (workflow step 3).
  for (const n of guardianNotices) {
    await notify({
      tenantId: ctx.tenantId!,
      recipientUserId: n.userId,
      category: "FINANCE",
      title: `Invoice issued — ${periodLabel}`,
      body: `A fee invoice for ${n.studentName} has been issued. Please review the balance in the portal.`,
      relatedType: "finance",
      relatedId: n.invoiceId,
      dedupeKey: `invoice:${n.invoiceId}`,
    });
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.billing.post",
    targetType: "FeeStructure",
    targetId: feeStructureId,
    campusId: structure.campusId,
    scopeType: "CAMPUS",
    metadata: { periodLabel, invoiceCount, totalAmount },
  });

  redirect(`/portal/fees/invoices?posted=${invoiceCount}`);
}

// ---- Payments (FEE-003/004) ----------------------------------------------

export async function recordPayment(formData: FormData) {
  const ctx = await requireUser();
  const studentId = String(formData.get("studentId"));
  const method = String(formData.get("method") || "CASH") as never;
  const amount = toCents(String(formData.get("amount") || "0"));
  const reference = String(formData.get("reference") || "");
  if (amount <= 0) throw new Error("Enter a positive amount.");

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId! },
    include: {
      enrollments: { where: { status: "ACTIVE" }, take: 1 },
    },
  });
  if (!student) throw new Error("Student not found");
  const campusId = student.enrollments[0]?.campusId;
  if (!campusId) throw new Error("Student has no active enrollment.");
  if (!canForCampus(ctx, "fee.collect", campusId))
    throw new Error("You cannot collect payments for this campus.");

  const rcpPrefix = await effectiveSetting(ctx.tenantId!, campusId, "receipt.prefix");
  const seq = await nextPaymentNumber(ctx.tenantId!);

  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        tenantId: ctx.tenantId!,
        campusId,
        studentId,
        number: rcpNo(seq, rcpPrefix),
        method,
        amount,
        reference: reference || null,
        status: "CONFIRMED",
        collectedByUserId: ctx.user.id,
      },
    });

    // Allocate FIFO against open invoices (oldest due first).
    const openInvoices = await tx.invoice.findMany({
      where: { studentId, status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: { dueDate: "asc" },
    });
    let remaining = amount;
    for (const inv of openInvoices) {
      if (remaining <= 0) break;
      const apply = Math.min(remaining, inv.balance);
      if (apply <= 0) continue;
      await tx.allocation.create({
        data: {
          tenantId: ctx.tenantId!,
          paymentId: payment.id,
          invoiceId: inv.id,
          amount: apply,
        },
      });
      remaining -= apply;
      await recomputeInvoice(tx, inv.id);
    }
    // `remaining` stays as an unallocated advance/credit on the payment.
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.payment.record",
    targetType: "Student",
    targetId: studentId,
    campusId,
    scopeType: "CAMPUS",
    metadata: { amount, method },
  });

  revalidatePath(`/portal/students/${studentId}`);
  revalidatePath("/portal/fees");
  revalidatePath("/portal/fees/invoices");
}

// ---- Adjustments — separation of duties (FEE-004, IAM-003) ---------------

export async function addCreditNote(formData: FormData) {
  const ctx = await requireUser();
  const invoiceId = String(formData.get("invoiceId"));
  const amount = toCents(String(formData.get("amount") || "0"));
  const reason = String(formData.get("reason") || "").trim();
  if (amount <= 0) throw new Error("Enter a positive amount.");
  if (!reason) throw new Error("A reason is required for adjustments.");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenantId! },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (!canForCampus(ctx, "fee.adjust", invoice.campusId))
    throw new Error("Adjustments require approval rights (separation of duties).");
  if (amount > invoice.balance)
    throw new Error("Credit cannot exceed the outstanding balance.");

  await prisma.$transaction(async (tx) => {
    await tx.creditNote.create({
      data: {
        tenantId: ctx.tenantId!,
        invoiceId,
        amount,
        reason,
        approvedByUserId: ctx.user.id,
      },
    });
    await recomputeInvoice(tx, invoiceId);
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.creditnote",
    targetType: "Invoice",
    targetId: invoiceId,
    campusId: invoice.campusId,
    scopeType: "CAMPUS",
    outcome: "SUCCESS",
    metadata: { amount, reason },
  });

  revalidatePath(`/portal/fees/invoices/${invoiceId}`);
}

// Write off the full remaining balance of an invoice (C.8).
export async function writeOffBalance(formData: FormData) {
  const ctx = await requireUser();
  const invoiceId = String(formData.get("invoiceId"));
  const reason = String(formData.get("reason") || "Bad debt write-off").trim();
  if (!reason) throw new Error("A reason is required for a write-off.");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenantId! },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (!canForCampus(ctx, "fee.adjust", invoice.campusId))
    throw new Error("Write-offs require fee.adjust permission.");
  if (invoice.balance <= 0) throw new Error("Invoice balance is already zero.");

  await prisma.$transaction(async (tx) => {
    await tx.creditNote.create({
      data: {
        tenantId: ctx.tenantId!,
        invoiceId,
        amount: invoice.balance,
        reason,
        approvedByUserId: ctx.user.id,
      },
    });
    await recomputeInvoice(tx, invoiceId);
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.writeoff",
    targetType: "Invoice",
    targetId: invoiceId,
    campusId: invoice.campusId,
    scopeType: "CAMPUS",
    metadata: { amount: invoice.balance, reason },
  });

  revalidatePath(`/portal/fees/invoices/${invoiceId}`);
  revalidatePath("/portal/fees");
}

// Create a payment plan for an invoice's outstanding balance (C.8).
export async function createPaymentPlan(formData: FormData) {
  const ctx = await requireUser();
  const invoiceId = String(formData.get("invoiceId"));
  const installmentsRaw = Number(formData.get("installments") ?? 2);
  const note = String(formData.get("note") || "").trim();

  if (!Number.isInteger(installmentsRaw) || installmentsRaw < 2 || installmentsRaw > 24)
    throw new Error("Installments must be between 2 and 24.");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId: ctx.tenantId! },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (!canForCampus(ctx, "fee.collect", invoice.campusId))
    throw new Error("You need fee.collect permission to create a payment plan.");
  if (invoice.balance <= 0) throw new Error("Invoice has no outstanding balance.");

  // Check no active plan already exists for this invoice
  const existing = await prisma.paymentPlan.findFirst({
    where: { invoiceId, tenantId: ctx.tenantId!, status: "ACTIVE" },
  });
  if (existing) throw new Error("An active payment plan already exists for this invoice.");

  const installmentAmount = Math.floor(invoice.balance / installmentsRaw);
  const remainder = invoice.balance - installmentAmount * installmentsRaw;
  const baseDate = invoice.dueDate > new Date() ? invoice.dueDate : new Date();

  await prisma.$transaction(async (tx) => {
    const plan = await tx.paymentPlan.create({
      data: {
        tenantId: ctx.tenantId!,
        studentId: invoice.studentId,
        campusId: invoice.campusId,
        invoiceId,
        totalAmount: invoice.balance,
        note: note || null,
        createdByUserId: ctx.user.id,
      },
    });

    for (let i = 0; i < installmentsRaw; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      const amount = i === 0 ? installmentAmount + remainder : installmentAmount;
      await tx.paymentPlanInstallment.create({
        data: {
          tenantId: ctx.tenantId!,
          planId: plan.id,
          dueDate,
          amount,
        },
      });
    }
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.paymentplan.created",
    targetType: "Invoice",
    targetId: invoiceId,
    campusId: invoice.campusId,
    scopeType: "CAMPUS",
    metadata: { installments: installmentsRaw, totalAmount: invoice.balance },
  });

  revalidatePath(`/portal/fees/invoices/${invoiceId}`);
}

// IAM-003: issueRefund now routes through maker-checker.
// The submitter creates an ApprovalRequest; a separate approveRefund action
// executes the actual Refund row once approved.
export async function issueRefund(formData: FormData) {
  const ctx = await requireUser();
  const studentId = String(formData.get("studentId"));
  const amount = toCents(String(formData.get("amount") || "0"));
  const reason = String(formData.get("reason") || "").trim();
  const method = String(formData.get("method") || "BANK");
  if (amount <= 0) throw new Error("Enter a positive amount.");
  if (!reason) throw new Error("A reason is required for refunds.");

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId! },
    include: { enrollments: { where: { status: "ACTIVE" }, take: 1 } },
  });
  if (!student) throw new Error("Student not found");
  const campusId = student.enrollments[0]?.campusId ?? "";
  if (!canForCampus(ctx, "fee.adjust", campusId))
    throw new Error("Refunds require fee.adjust permission.");

  const { requestApproval } = await import("@/lib/approvals");
  await requestApproval({
    tenantId: ctx.tenantId!,
    campusId,
    requestType: "fee.adjust",
    referenceType: "Student",
    referenceId: studentId,
    requestedByUserId: ctx.user.id,
    payload: { studentId, amount, method, reason },
    note: reason,
  });

  revalidatePath(`/portal/students/${studentId}`);
}

