import Link from "next/link";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { formatMoney } from "@/lib/money";
import { PageHeader, Card, Badge, StatCard, ButtonLink } from "@/components/ui";

function agingBucket(dueDate: Date): "current" | "1-30" | "31-60" | "60+" {
  const days = Math.floor((Date.now() - dueDate.getTime()) / 864e5);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  return "60+";
}

export default async function FeesDashboardPage() {
  const ctx = await requirePermission("fee.read");
  const campusIds = allowedCampusIds(ctx, "fee.read");
  const campusFilter = campusIds ? { campusId: { in: campusIds } } : {};
  const anyCampus = ctx.campusIds[0];
  const canBill =
    campusIds === null || campusIds.some((c) => canForCampus(ctx, "fee.bill", c)) ||
    (anyCampus ? canForCampus(ctx, "fee.bill", anyCampus) : false);

  const [invoices, payments, recentInvoices, recentPayments] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId!, ...campusFilter },
      select: { total: true, balance: true, dueDate: true, status: true },
    }),
    prisma.payment.findMany({
      where: { tenantId: ctx.tenantId!, status: "CONFIRMED", ...campusFilter },
      select: { amount: true },
    }),
    prisma.invoice.findMany({
      where: { tenantId: ctx.tenantId!, ...campusFilter },
      include: { student: { include: { person: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.payment.findMany({
      where: { tenantId: ctx.tenantId!, ...campusFilter },
      include: { student: { include: { person: true } } },
      orderBy: { receivedAt: "desc" },
      take: 8,
    }),
  ]);

  const billed = invoices.reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.reduce((s, i) => s + i.balance, 0);
  const collected = payments.reduce((s, p) => s + p.amount, 0);
  const aging = { current: 0, "1-30": 0, "31-60": 0, "60+": 0 };
  for (const i of invoices) {
    if (i.balance > 0) aging[agingBucket(i.dueDate)] += i.balance;
  }
  const collectionRate = billed > 0 ? Math.round(((billed - outstanding) / billed) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Fees & finance"
        subtitle="Billing, collections and outstanding balances."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/portal/fees/reports" variant="ghost">
              Reports
            </ButtonLink>
            <ButtonLink href="/portal/fees/structures" variant="ghost">
              Fee structures
            </ButtonLink>
            {canBill && <ButtonLink href="/portal/fees/billing">Run billing</ButtonLink>}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Billed" value={formatMoney(billed)} />
        <StatCard label="Collected" value={formatMoney(collected)} tone="green" hint={`${collectionRate}% of billed`} />
        <StatCard label="Outstanding" value={formatMoney(outstanding)} tone="amber" />
        <StatCard label="Overdue" value={formatMoney(aging["1-30"] + aging["31-60"] + aging["60+"])} tone="red" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 font-semibold">Aging of outstanding</h3>
          <ul className="space-y-2 text-sm">
            {(["current", "1-30", "31-60", "60+"] as const).map((k) => {
              const pct = outstanding > 0 ? Math.round((aging[k] / outstanding) * 100) : 0;
              const tone = k === "current" ? "bg-green-500" : k === "1-30" ? "bg-amber-400" : k === "31-60" ? "bg-orange-500" : "bg-red-600";
              return (
                <li key={k}>
                  <div className="flex justify-between">
                    <span className="text-[color:var(--color-muted)]">
                      {k === "current" ? "Not due" : `${k} days`}
                    </span>
                    <span className="font-medium">{formatMoney(aging[k])}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Recent invoices</h3>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">None yet.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-line)]">
              {recentInvoices.map((i) => (
                <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/portal/fees/invoices/${i.id}`} className="text-brand-700 hover:underline">
                    {i.number}
                  </Link>
                  <span className="text-[color:var(--color-muted)]">
                    {i.student.person.firstName} {i.student.person.lastName}
                  </span>
                  <span className="font-medium">{formatMoney(i.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Recent payments</h3>
          {recentPayments.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">None yet.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-line)]">
              {recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{p.number}</span>
                  <span className="text-[color:var(--color-muted)]">
                    {p.student.person.firstName} {p.student.person.lastName}
                  </span>
                  <span className="font-medium text-green-700">{formatMoney(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
