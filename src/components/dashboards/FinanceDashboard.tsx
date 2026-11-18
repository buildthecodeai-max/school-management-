import { ctxTranslator } from "@/lib/i18n";
import { prisma } from "@/lib/db";
import type { AuthzContext } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { formatMoney } from "@/lib/money";
import { StatCard, Card, PageHeader, ButtonLink } from "@/components/ui";

export async function FinanceDashboard({ ctx }: { ctx: AuthzContext }) {
  const tenantId = ctx.tenantId!;
  const tr = ctxTranslator(ctx);
  const campusIds = allowedCampusIds(ctx, "fee.read");
  const campusFilter = campusIds ? { in: campusIds } : undefined;

  const [openInvoices, overdueCount, reconciliationPending, recentRuns] = await Promise.all([
    prisma.invoice.aggregate({
      where: { tenantId, status: { in: ["OPEN", "PARTIAL"] }, ...(campusFilter ? { campusId: campusFilter } : {}) },
      _count: { id: true },
      _sum: { balance: true },
    }),
    prisma.invoice.count({
      where: {
        tenantId,
        status: { in: ["OPEN", "PARTIAL"] },
        dueDate: { lt: new Date() },
        ...(campusFilter ? { campusId: campusFilter } : {}),
      },
    }),
    prisma.bankStatementLine.count({
      where: { tenantId, status: "UNMATCHED", ...(campusFilter ? { campusId: campusFilter } : {}) },
    }),
    prisma.billingRun.findMany({
      where: { tenantId, ...(campusFilter ? { campusId: campusFilter } : {}) },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  // Fetch campus names separately since BillingRun has no campus relation
  const campusNameMap = new Map<string, string>();
  if (recentRuns.length > 0) {
    const ids = [...new Set(recentRuns.map((r) => r.campusId))];
    const campuses = await prisma.campus.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    for (const c of campuses) campusNameMap.set(c.id, c.name);
  }

  return (
    <div>
      <PageHeader
        title={tr("Finance Dashboard")}
        subtitle={tr("Fee collection and reconciliation overview")}
        action={<ButtonLink href="/portal/fees">{tr("Fee management")}</ButtonLink>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={tr("Outstanding balance")} value={formatMoney(openInvoices._sum.balance ?? 0)} tone="amber" hint={tr("{n} open invoice(s)", { n: openInvoices._count.id })} />
        <StatCard label={tr("Overdue invoices")} value={overdueCount} tone="sky" hint={tr("past due date")} />
        <StatCard label={tr("Unmatched bank lines")} value={reconciliationPending} tone="sky" hint={tr("pending reconciliation")} />
      </div>

      <div className="mt-6">
        <Card>
          <h3 className="mb-3 font-semibold">{tr("Recent billing runs")}</h3>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">{tr("No billing runs yet.")}</p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-line)]">
              {recentRuns.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{r.periodLabel}</span>
                    <span className="ml-2 text-[color:var(--color-muted)]">{campusNameMap.get(r.campusId) ?? r.campusId}</span>
                  </div>
                  <span>{tr("{n} invoice(s)", { n: r.invoiceCount })} · {formatMoney(r.totalAmount)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <ButtonLink href="/portal/fees/reconciliation" variant="ghost">{tr("Bank reconciliation")}</ButtonLink>
            <ButtonLink href="/portal/fees/journal" variant="ghost">{tr("GL journal export")}</ButtonLink>
          </div>
        </Card>
      </div>
    </div>
  );
}
