import "server-only";
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

// Compute one student's invoice figures from a fee structure + their discount.
export function computeInvoiceFromStructure(
  lines: { amount: number; feeHead: { taxRatePct: number } }[],
  discountPct: number,
) {
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const taxTotal = lines.reduce(
    (s, l) => s + Math.round((l.amount * l.feeHead.taxRatePct) / 100),
    0,
  );
  const discountTotal = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discountTotal + taxTotal;
  return { subtotal, taxTotal, discountTotal, total };
}

export interface BillingPreviewRow {
  studentId: string;
  name: string;
  admissionNumber: string;
  discountPct: number;
  total: number;
  alreadyInvoiced: boolean;
}

// Resolve eligible students for a fee structure and compute their invoices,
// flagging any already invoiced for the given period (idempotency preview).
export async function resolveBillingPreview(
  tenantId: string,
  feeStructureId: string,
  periodLabel: string,
): Promise<{ rows: BillingPreviewRow[]; structure: { id: string; name: string; campusId: string; gradeLevelId: string | null } } | null> {
  const structure = await prisma.feeStructure.findFirst({
    where: { id: feeStructureId, tenantId },
    include: { lines: { include: { feeHead: true } } },
  });
  if (!structure) return null;

  const enrollments = await prisma.enrollment.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      campusId: structure.campusId,
      ...(structure.gradeLevelId ? { gradeLevelId: structure.gradeLevelId } : {}),
    },
    include: { student: { include: { person: true, feeAssignments: true } } },
  });

  const existing = await prisma.invoice.findMany({
    where: { tenantId, feeStructureId, periodLabel },
    select: { studentId: true },
  });
  const invoicedSet = new Set(existing.map((e) => e.studentId));

  const rows: BillingPreviewRow[] = enrollments.map((e) => {
    const assignment = e.student.feeAssignments.find(
      (a) => a.feeStructureId === feeStructureId,
    );
    const discountPct = assignment?.discountPct ?? 0;
    const { total } = computeInvoiceFromStructure(structure.lines, discountPct);
    return {
      studentId: e.student.id,
      name: `${e.student.person.firstName} ${e.student.person.lastName}`,
      admissionNumber: e.student.admissionNumber,
      discountPct,
      total,
      alreadyInvoiced: invoicedSet.has(e.student.id),
    };
  });

  return {
    rows,
    structure: {
      id: structure.id,
      name: structure.name,
      campusId: structure.campusId,
      gradeLevelId: structure.gradeLevelId,
    },
  };
}

// Next sequential document number for a tenant, e.g. INV-000042.
export async function nextInvoiceNumber(tenantId: string): Promise<number> {
  return (await prisma.invoice.count({ where: { tenantId } })) + 1;
}
export async function nextPaymentNumber(tenantId: string): Promise<number> {
  return (await prisma.payment.count({ where: { tenantId } })) + 1;
}

export function invNo(n: number, prefix = "INV"): string {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}
export function rcpNo(n: number, prefix = "RCP"): string {
  return `${prefix}-${String(n).padStart(6, "0")}`;
}

// FEE-001: Splits a line total into installments based on installmentPlan or
// equal distribution over installmentCount months from baseDate.
export interface InstallmentSchedule {
  dueDate: Date;
  amount: number; // cents
  label: string; // e.g. "Installment 1/3"
}
export function buildInstallmentSchedule(
  lineAmount: number, // cents
  installmentCount: number,
  installmentPlan: unknown, // [{dueDate: ISO, pct: number}] | null
  baseDate: Date,
): InstallmentSchedule[] {
  if (installmentCount <= 1) return [];

  // Use explicit plan if provided and has the right number of entries
  if (Array.isArray(installmentPlan) && installmentPlan.length === installmentCount) {
    let remaining = lineAmount;
    return (installmentPlan as { dueDate: string; pct: number }[]).map((p, i) => {
      const isLast = i === installmentPlan.length - 1;
      const amount = isLast ? remaining : Math.round((lineAmount * p.pct) / 100);
      remaining -= amount;
      return { dueDate: new Date(p.dueDate), amount, label: `Installment ${i + 1}/${installmentCount}` };
    });
  }

  // Fall back to equal split, one installment per month from baseDate
  const amountEach = Math.floor(lineAmount / installmentCount);
  const remainder = lineAmount - amountEach * installmentCount;
  return Array.from({ length: installmentCount }, (_, i) => {
    const due = new Date(baseDate);
    due.setMonth(due.getMonth() + i);
    return {
      dueDate: due,
      amount: amountEach + (i === installmentCount - 1 ? remainder : 0),
      label: `Installment ${i + 1}/${installmentCount}`,
    };
  });
}

// Recompute an invoice's balance/status from its allocations and credit notes.
export async function recomputeInvoice(
  tx: Prisma.TransactionClient,
  invoiceId: string,
) {
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { allocations: true, creditNotes: true },
  });
  const paid = inv.allocations.reduce((s, a) => s + a.amount, 0);
  const credited = inv.creditNotes.reduce((s, c) => s + c.amount, 0);
  const balance = Math.max(0, inv.total - paid - credited);
  const status =
    balance === 0 ? "PAID" : balance < inv.total ? "PARTIAL" : "OPEN";
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { balance, status },
  });
  return balance;
}
