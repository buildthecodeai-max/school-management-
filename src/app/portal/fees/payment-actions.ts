"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { recomputeInvoice } from "@/lib/finance-server";
import { formatMoney } from "@/lib/money";

export interface PaymentActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

class Blocked extends Error {}

/**
 * Reverse a confirmed payment (bounced cheque, wrong amount, duplicate). The
 * receipt number stays on record as REVERSED; the invoices it settled reopen.
 * Needs fee.adjust on the payment's campus and a written reason.
 */
export async function reversePayment(_p: PaymentActionState, f: FormData): Promise<PaymentActionState> {
  const ctx = await requireUser();
  const payment = await prisma.payment.findFirst({
    where: { id: String(f.get("paymentId") ?? ""), tenantId: ctx.tenantId! },
    include: { allocations: true },
  });
  if (!payment) return { error: "Payment not found." };
  if (!canForCampus(ctx, "fee.adjust", payment.campusId)) return { error: "Reversing a payment needs fee-adjustment rights on this campus." };
  if (payment.status === "REVERSED") return { error: "This payment was already reversed." };
  if (payment.status !== "CONFIRMED") return { error: "Only a confirmed payment can be reversed." };
  const reason = String(f.get("reason") ?? "").trim().slice(0, 300);
  if (reason.length < 5) return { error: "Give a reason (at least 5 characters)." };

  try {
    await prisma.$transaction(async (tx) => {
      // Claim first so a double click cannot reverse twice.
      const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: "CONFIRMED" }, data: { status: "REVERSED", note: `${payment.note ? payment.note + " | " : ""}Reversed: ${reason}` } });
      if (claimed.count === 0) throw new Blocked("This payment was already reversed.");
      await tx.allocation.deleteMany({ where: { paymentId: payment.id } });
      for (const invoiceId of new Set(payment.allocations.map((a) => a.invoiceId))) await recomputeInvoice(tx, invoiceId);

      // Money already handed back as a refund cannot be reversed away: the books would show negative credit.
      const [paid, allocated, refunded] = await Promise.all([
        tx.payment.aggregate({ where: { tenantId: ctx.tenantId!, studentId: payment.studentId, status: "CONFIRMED" }, _sum: { amount: true } }),
        tx.allocation.aggregate({ where: { tenantId: ctx.tenantId!, payment: { studentId: payment.studentId, status: "CONFIRMED" } }, _sum: { amount: true } }),
        tx.refund.aggregate({ where: { tenantId: ctx.tenantId!, studentId: payment.studentId }, _sum: { amount: true } }),
      ]);
      const credit = (paid._sum.amount ?? 0) - (allocated._sum.amount ?? 0) - (refunded._sum.amount ?? 0);
      if (credit < 0)
        throw new Blocked(`A refund of ${formatMoney(refunded._sum.amount ?? 0)} was already issued against this student's money, so this payment cannot be reversed without leaving the account negative.`);
    });
  } catch (e) {
    if (e instanceof Blocked) return { error: e.message };
    throw e;
  }

  await audit({
    tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.payment.reversed", targetType: "Payment", targetId: payment.id,
    campusId: payment.campusId, scopeType: "CAMPUS",
    metadata: { number: payment.number, amount: payment.amount, reason, allocations: payment.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: a.amount })) },
  });
  revalidatePath(`/portal/fees/receipt/${payment.id}`);
  revalidatePath("/portal/fees");
  return { ok: true, message: `Receipt ${payment.number} reversed. ${payment.allocations.length} invoice(s) reopened.` };
}
