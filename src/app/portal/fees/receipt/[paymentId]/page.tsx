import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/attendance";
import { Badge } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { ActionForm, inputCls } from "@/components/ActionForm";
import { reversePayment } from "../../payment-actions";

export const metadata = { title: "Payment receipt" };

// One receipt per payment: what was paid, how, and which invoices it settled.
export default async function PaymentReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const ctx = await requirePermission("fee.read");
  const { paymentId } = await params;
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId: ctx.tenantId! },
    include: { student: { include: { person: true } }, allocations: { include: { invoice: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!payment) notFound();
  const allowed = allowedCampusIds(ctx, "fee.read");
  if (allowed && !allowed.includes(payment.campusId)) notFound();
  const [campus, tenant] = await Promise.all([
    prisma.campus.findFirst({ where: { id: payment.campusId, tenantId: ctx.tenantId! } }),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId! } }),
  ]);
  if (!campus || !tenant) notFound();
  const applied = payment.allocations.reduce((s, a) => s + a.amount, 0);
  const unapplied = payment.amount - applied;
  const reversed = payment.status === "REVERSED";
  const canReverse = payment.status === "CONFIRMED" && canForCampus(ctx, "fee.adjust", payment.campusId);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/portal/fees/reports" className="text-sm text-brand-700 hover:underline">← Fee reports</Link>
        <PrintButton label="Print receipt" />
      </div>
      <div className="card p-8">
        <div className="flex items-start justify-between border-b border-[color:var(--color-line)] pb-4">
          <div>
            <p className="text-lg font-semibold">{tenant.name}</p>
            <p className="text-sm text-[color:var(--color-muted)]">{campus.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Receipt</p>
            <p className="font-semibold">{payment.number}</p>
            <p className="text-sm text-[color:var(--color-muted)]">{formatDay(payment.receivedAt)}</p>
          </div>
        </div>

        {reversed && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-200">This payment was reversed and no longer counts.</p>}
        {payment.status === "PENDING" && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">This payment is pending confirmation.</p>}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-[color:var(--color-muted)]">Received from / for</dt><dd className="font-medium">{payment.student.person.firstName} {payment.student.person.lastName}</dd><dd className="text-xs text-[color:var(--color-muted)]">{payment.student.admissionNumber}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-muted)]">Method</dt><dd className="font-medium">{payment.method}</dd>{payment.reference && <dd className="text-xs text-[color:var(--color-muted)]">Ref: {payment.reference}</dd>}</div>
        </dl>

        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]"><th className="py-2 font-medium">Applied to</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody>
            {payment.allocations.map((a) => (
              <tr key={a.id} className="border-b border-[color:var(--color-line)]"><td className="py-2">Invoice {a.invoice.number}</td><td className="py-2 text-right">{formatMoney(a.amount)}</td></tr>
            ))}
            {unapplied > 0 && !reversed && (
              <tr className="border-b border-[color:var(--color-line)]"><td className="py-2">Held as credit on account</td><td className="py-2 text-right">{formatMoney(unapplied)}</td></tr>
            )}
          </tbody>
        </table>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-4">
          <span className="text-sm text-[color:var(--color-muted)]">Total received</span>
          <span className="text-2xl font-semibold">{formatMoney(payment.amount)}</span>
        </div>
        <div className="mt-3 flex justify-end"><Badge tone={reversed ? "red" : payment.status === "CONFIRMED" ? "green" : "amber"}>{payment.status}</Badge></div>
        {payment.note && <p className="mt-3 text-xs text-[color:var(--color-muted)]">{payment.note}</p>}
      </div>

      {canReverse && (
        <div className="card mt-6 p-5 print:hidden">
          <h3 className="mb-2 text-sm font-semibold">Reverse this payment</h3>
          <p className="mb-3 text-xs text-[color:var(--color-muted)]">Use for a bounced cheque, a wrong amount or a duplicate. Invoices it settled will reopen. This is recorded in the audit log.</p>
          <ActionForm action={reversePayment} submit="Reverse payment" variant="danger" confirmText="Reverse this payment? Invoices it settled will reopen." className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="paymentId" value={payment.id} />
            <input name="reason" required minLength={5} maxLength={300} placeholder="Reason" className={inputCls} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
