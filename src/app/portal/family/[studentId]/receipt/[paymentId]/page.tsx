import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { familyAccess } from "@/lib/family";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/attendance";
import { Badge } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Receipt" };

// A guardian's copy of a receipt. Only the paying or primary guardian of this child may see it,
// and only if the payment really belongs to this child.
export default async function FamilyReceiptPage({ params }: { params: Promise<{ studentId: string; paymentId: string }> }) {
  const ctx = await requireUser();
  const { studentId, paymentId } = await params;
  const link = await familyAccess(ctx, studentId);
  if (!link || !link.canSeeFees) notFound();
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, studentId, tenantId: ctx.tenantId! },
    include: { student: { include: { person: true } }, allocations: { include: { invoice: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!payment) notFound();
  const [campus, tenant] = await Promise.all([
    prisma.campus.findFirst({ where: { id: payment.campusId, tenantId: ctx.tenantId! } }),
    prisma.tenant.findUnique({ where: { id: ctx.tenantId! } }),
  ]);
  if (!campus || !tenant) notFound();
  const applied = payment.allocations.reduce((s, a) => s + a.amount, 0);
  const unapplied = payment.amount - applied;
  const reversed = payment.status === "REVERSED";

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/portal/family/${studentId}?tab=fees`} className="text-sm text-brand-700 hover:underline">← Fees</Link>
        <PrintButton label="Print receipt" />
      </div>
      <div className="card p-8">
        <div className="flex items-start justify-between border-b border-[color:var(--color-line)] pb-4">
          <div><p className="text-lg font-semibold">{tenant.name}</p><p className="text-sm text-[color:var(--color-muted)]">{campus.name}</p></div>
          <div className="text-right"><p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Receipt</p><p className="font-semibold">{payment.number}</p><p className="text-sm text-[color:var(--color-muted)]">{formatDay(payment.receivedAt)}</p></div>
        </div>
        {reversed && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-200">This payment was reversed and no longer counts.</p>}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-[color:var(--color-muted)]">Student</dt><dd className="font-medium">{payment.student.person.firstName} {payment.student.person.lastName}</dd></div>
          <div><dt className="text-xs text-[color:var(--color-muted)]">Method</dt><dd className="font-medium">{payment.method}</dd></div>
        </dl>
        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]"><th className="py-2 font-medium">Applied to</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody>
            {payment.allocations.map((a) => <tr key={a.id} className="border-b border-[color:var(--color-line)]"><td className="py-2">Invoice {a.invoice.number}</td><td className="py-2 text-right">{formatMoney(a.amount)}</td></tr>)}
            {unapplied > 0 && !reversed && <tr className="border-b border-[color:var(--color-line)]"><td className="py-2">Held as credit on account</td><td className="py-2 text-right">{formatMoney(unapplied)}</td></tr>}
          </tbody>
        </table>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 p-4"><span className="text-sm text-[color:var(--color-muted)]">Total received</span><span className="text-2xl font-semibold">{formatMoney(payment.amount)}</span></div>
        <div className="mt-3 flex justify-end"><Badge tone={reversed ? "red" : "green"}>{payment.status}</Badge></div>
      </div>
    </div>
  );
}
