import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PageHeader, Card, Badge, StatCard } from "@/components/ui";
import { recordPayment, addCreditNote, writeOffBalance, createPaymentPlan } from "../../actions";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission("fee.read");
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: {
      student: { include: { person: true } },
      lines: { include: { feeHead: true } },
      allocations: { include: { payment: true }, orderBy: { createdAt: "desc" } },
      creditNotes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!invoice) notFound();

  const allowed = allowedCampusIds(ctx, "fee.read");
  if (allowed && !allowed.includes(invoice.campusId)) notFound();

  const canCollect = canForCampus(ctx, "fee.collect", invoice.campusId);
  const canAdjust = canForCampus(ctx, "fee.adjust", invoice.campusId);
  const overdue = invoice.balance > 0 && invoice.dueDate < new Date();

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/fees/invoices" className="text-sm text-brand-700 hover:underline">
          ← Invoices
        </Link>
      </div>

      <PageHeader
        title={invoice.number}
        subtitle={`${invoice.student.person.firstName} ${invoice.student.person.lastName} · ${invoice.periodLabel} · due ${invoice.dueDate.toLocaleDateString()}`}
        action={
          <div className="flex items-center gap-2">
            <a
              href={`/portal/fees/invoices/${invoice.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
            >
              Print invoice
            </a>
            {(invoice.allocations.length > 0 || invoice.creditNotes.length > 0) && (
              <a
                href={`/portal/fees/invoices/${invoice.id}/receipt`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
              >
                View receipt
              </a>
            )}
            <Badge tone={invoice.status === "PAID" ? "green" : invoice.status === "PARTIAL" ? "amber" : "sky"}>{invoice.status}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total" value={formatMoney(invoice.total)} />
        <StatCard label="Balance" value={formatMoney(invoice.balance)} tone={invoice.balance > 0 ? "amber" : "green"} />
        <StatCard label="Discount" value={formatMoney(invoice.discountTotal)} tone="slate" />
        <StatCard label="Tax" value={formatMoney(invoice.taxTotal)} tone="slate" />
      </div>

      {overdue && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          This invoice is overdue.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h3 className="mb-3 font-semibold">Line items</h3>
            <table className="w-full text-sm">
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id} className="border-b border-[color:var(--color-line)] last:border-0">
                    <td className="py-2">{l.description}</td>
                    <td className="py-2 text-right text-[color:var(--color-muted)]">
                      {l.taxAmount > 0 ? `+${formatMoney(l.taxAmount)} tax` : ""}
                    </td>
                    <td className="py-2 text-right font-medium">{formatMoney(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[color:var(--color-line)]">
                  <td className="pt-2 font-semibold" colSpan={2}>Total</td>
                  <td className="pt-2 text-right font-semibold">{formatMoney(invoice.total)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold">Payments &amp; adjustments</h3>
            {invoice.allocations.length === 0 && invoice.creditNotes.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">Nothing applied yet.</p>
            ) : (
              <ul className="divide-y divide-[color:var(--color-line)] text-sm">
                {invoice.allocations.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <span>Payment {a.payment.number} · {a.payment.method}</span>
                    <span className="font-medium text-green-700">{formatMoney(a.amount)}</span>
                  </li>
                ))}
                {invoice.creditNotes.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <span>Credit note · {c.reason}</span>
                    <span className="font-medium text-sky-700">−{formatMoney(c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {invoice.balance > 0 && canCollect && (
            <Card>
              <h3 className="mb-3 font-semibold">Record payment</h3>
              <form action={recordPayment} className="space-y-3">
                <input type="hidden" name="studentId" value={invoice.studentId} />
                <div>
                  <label className={labelCls}>Amount ($)</label>
                  <input name="amount" type="number" step="0.01" defaultValue={(invoice.balance / 100).toFixed(2)} className={input} />
                </div>
                <div>
                  <label className={labelCls}>Method</label>
                  <select name="method" className={input} defaultValue="CASH">
                    <option value="CASH">Cash</option>
                    <option value="BANK">Bank transfer</option>
                    <option value="CARD">Card</option>
                    <option value="WALLET">Wallet</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="GATEWAY">Online gateway</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Reference</label>
                  <input name="reference" className={input} placeholder="Optional" />
                </div>
                <button className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  Record &amp; allocate
                </button>
                <p className="text-xs text-[color:var(--color-muted)]">
                  Payment is allocated to open invoices oldest-first; any excess is held as advance credit.
                </p>
              </form>
            </Card>
          )}

          {invoice.balance > 0 && (
            <Card>
              <h3 className="mb-3 font-semibold">Adjustment / credit note</h3>
              {canAdjust ? (
                <form action={addCreditNote} className="space-y-3">
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <div>
                    <label className={labelCls}>Amount ($)</label>
                    <input name="amount" type="number" step="0.01" className={input} />
                  </div>
                  <div>
                    <label className={labelCls}>Reason (required)</label>
                    <input name="reason" required className={input} placeholder="e.g. hardship waiver" />
                  </div>
                  <button className="w-full rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">
                    Apply credit note
                  </button>
                </form>
              ) : (
                <p className="text-sm text-[color:var(--color-muted)]">
                  Credit notes and refunds require approval rights (separation of duties). Ask a campus administrator.
                </p>
              )}
            </Card>
          )}

          {invoice.balance > 0 && canAdjust && (
            <Card>
              <h3 className="mb-3 font-semibold">Write off balance</h3>
              <form action={writeOffBalance} className="space-y-3">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div>
                  <label className={labelCls}>Reason (required)</label>
                  <input name="reason" required className={input} placeholder="e.g. bad debt — unable to collect" />
                </div>
                <p className="text-xs text-[color:var(--color-muted)]">
                  This will create a credit note for the full balance of {formatMoney(invoice.balance)} and mark the invoice as paid. This action cannot be undone.
                </p>
                <button className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                  Write off {formatMoney(invoice.balance)}
                </button>
              </form>
            </Card>
          )}

          {invoice.balance > 0 && canCollect && (
            <Card>
              <h3 className="mb-3 font-semibold">Payment plan</h3>
              <form action={createPaymentPlan} className="space-y-3">
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <div>
                  <label className={labelCls}>Number of installments</label>
                  <select name="installments" className={input} defaultValue="3">
                    {[2, 3, 4, 6, 9, 12].map((n) => (
                      <option key={n} value={n}>{n} installments ({formatMoney(Math.round(invoice.balance / n))} each)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Note (optional)</label>
                  <input name="note" className={input} placeholder="e.g. agreed with parent on call" />
                </div>
                <button className="w-full rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">
                  Create payment plan
                </button>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

const input =
  "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const labelCls = "mb-1 block text-xs text-[color:var(--color-muted)]";
