import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PageHeader, Card, ButtonLink } from "@/components/ui";

type Tab = "outstanding" | "collections" | "concessions" | "ledger";

function agingBucket(dueDate: Date) {
  const days = Math.floor((Date.now() - dueDate.getTime()) / 864e5);
  if (days <= 0) return "Current";
  if (days <= 30) return "1–30 days";
  if (days <= 60) return "31–60 days";
  return "60+ days";
}

function agingColor(bucket: string) {
  if (bucket === "Current") return "text-green-700";
  if (bucket === "1–30 days") return "text-amber-700";
  if (bucket === "31–60 days") return "text-orange-700";
  return "text-red-700";
}

const TABS: { key: Tab; label: string }[] = [
  { key: "outstanding", label: "Outstanding" },
  { key: "collections", label: "Collections" },
  { key: "concessions", label: "Concessions" },
  { key: "ledger", label: "Student ledger" },
];

export default async function FeeReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requirePermission("fee.read");
  const campusIds = allowedCampusIds(ctx, "fee.read");
  const params = await searchParams;
  const tab: Tab = (TABS.some((t) => t.key === params.tab) ? params.tab : "outstanding") as Tab;
  const campusFilter = campusIds ? { campusId: { in: campusIds } } : {};

  // Fetch campuses for display
  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, ...(campusIds ? { id: { in: campusIds } } : {}) },
    select: { id: true, name: true },
  });
  const campusName = new Map(campuses.map((c) => [c.id, c.name]));

  const [outstanding, collections, concessions, ledger] = await Promise.all([
    tab === "outstanding"
      ? prisma.invoice.findMany({
          where: { tenantId: ctx.tenantId!, status: { in: ["OPEN", "PARTIAL"] }, ...campusFilter },
          include: { student: { include: { person: true } } },
          orderBy: { dueDate: "asc" },
        })
      : Promise.resolve([]),

    tab === "collections"
      ? prisma.payment.findMany({
          where: { tenantId: ctx.tenantId!, status: "CONFIRMED", ...campusFilter },
          include: { student: { include: { person: true } } },
          orderBy: { receivedAt: "desc" },
          take: 300,
        })
      : Promise.resolve([]),

    tab === "concessions"
      ? prisma.creditNote.findMany({
          where: {
            tenantId: ctx.tenantId!,
            ...(campusIds ? { invoice: { campusId: { in: campusIds } } } : {}),
          },
          include: { invoice: { include: { student: { include: { person: true } } } } },
          orderBy: { createdAt: "desc" },
          take: 300,
        })
      : Promise.resolve([]),

    tab === "ledger"
      ? prisma.student.findMany({
          where: { tenantId: ctx.tenantId!, enrollments: campusIds ? { some: { campusId: { in: campusIds }, status: "ACTIVE" } } : { some: { status: "ACTIVE" } } },
          include: {
            person: true,
            invoices: { orderBy: { issueDate: "desc" }, take: 20 },
            payments: { orderBy: { receivedAt: "desc" }, take: 20 },
          },
          take: 50,
          orderBy: { person: { lastName: "asc" } },
        })
      : Promise.resolve([]),
  ]);

  const tabLinkCls = (k: Tab) =>
    k === tab
      ? "border-b-2 border-brand-700 pb-2 text-sm font-semibold text-brand-700"
      : "pb-2 text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]";

  const thCls = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";
  const tdCls = "py-2 pr-4 text-sm";
  const tdMuted = "py-2 pr-4 text-sm text-[color:var(--color-muted)]";

  return (
    <div>
      <PageHeader
        title="Fee reports"
        subtitle="Aging, collections, concessions and student ledger."
        action={
          <ButtonLink href="/portal/fees" variant="ghost">
            ← Fees
          </ButtonLink>
        }
      />

      <div className="mb-6 flex gap-6 border-b border-[color:var(--color-line)]">
        {TABS.map((t) => (
          <Link key={t.key} href={`?tab=${t.key}`} className={tabLinkCls(t.key)}>
            {t.label}
          </Link>
        ))}
      </div>

      {/* ── Outstanding ── */}
      {tab === "outstanding" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Outstanding invoices</h3>
            <span className="text-sm text-[color:var(--color-muted)]">
              {outstanding.length} invoice{outstanding.length !== 1 ? "s" : ""} ·{" "}
              <strong>{formatMoney(outstanding.reduce((s, i) => s + i.balance, 0))}</strong> outstanding
            </span>
          </div>
          {outstanding.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">No outstanding invoices. All balances are settled.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={thCls}>Invoice</th>
                    <th className={thCls}>Student</th>
                    <th className={thCls}>Campus</th>
                    <th className={thCls}>Period</th>
                    <th className={thCls}>Due date</th>
                    <th className={thCls + " text-right"}>Balance</th>
                    <th className={thCls + " text-right pr-0"}>Aging</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-line)]">
                  {outstanding.map((inv) => {
                    const bucket = agingBucket(inv.dueDate);
                    return (
                      <tr key={inv.id}>
                        <td className={tdCls}>
                          <Link href={`/portal/fees/invoices/${inv.id}`} className="text-brand-700 hover:underline">
                            {inv.number}
                          </Link>
                        </td>
                        <td className={tdCls}>
                          {inv.student.person.firstName} {inv.student.person.lastName}
                        </td>
                        <td className={tdMuted}>{campusName.get(inv.campusId) ?? "—"}</td>
                        <td className={tdMuted}>{inv.periodLabel}</td>
                        <td className={tdMuted}>{inv.dueDate.toLocaleDateString()}</td>
                        <td className="py-2 pr-4 text-right text-sm font-medium">{formatMoney(inv.balance)}</td>
                        <td className={`py-2 text-right text-xs font-semibold ${agingColor(bucket)}`}>{bucket}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Collections ── */}
      {tab === "collections" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Payments received</h3>
            <span className="text-sm text-[color:var(--color-muted)]">
              {collections.length} payment{collections.length !== 1 ? "s" : ""} ·{" "}
              <strong>{formatMoney(collections.reduce((s, p) => s + p.amount, 0))}</strong> collected
            </span>
          </div>
          {collections.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">No payments recorded yet.</p>
          ) : (
            <>
              {/* Summary by method */}
              <div className="mb-4 flex flex-wrap gap-4">
                {Object.entries(
                  collections.reduce<Record<string, number>>((acc, p) => {
                    acc[p.method] = (acc[p.method] ?? 0) + p.amount;
                    return acc;
                  }, {}),
                ).map(([method, total]) => (
                  <div key={method} className="rounded-lg bg-[color:var(--color-surface-raised)] px-3 py-2 text-sm">
                    <span className="text-[color:var(--color-muted)]">{method}</span>{" "}
                    <span className="font-semibold">{formatMoney(total)}</span>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className={thCls}>Receipt</th>
                      <th className={thCls}>Student</th>
                      <th className={thCls}>Campus</th>
                      <th className={thCls}>Method</th>
                      <th className={thCls}>Reference</th>
                      <th className={thCls}>Date</th>
                      <th className={thCls + " text-right pr-0"}>Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-line)]">
                    {collections.map((p) => (
                      <tr key={p.id}>
                        <td className={tdCls + " font-medium"}>{p.number}</td>
                        <td className={tdCls}>
                          {p.student.person.firstName} {p.student.person.lastName}
                        </td>
                        <td className={tdMuted}>{campusName.get(p.campusId) ?? "—"}</td>
                        <td className={tdMuted}>{p.method}</td>
                        <td className={tdMuted}>{p.reference ?? "—"}</td>
                        <td className={tdMuted}>{p.receivedAt.toLocaleDateString()}</td>
                        <td className="py-2 text-right text-sm font-semibold text-green-700">
                          {formatMoney(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      {/* ── Concessions ── */}
      {tab === "concessions" && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Credit notes & concessions</h3>
            <span className="text-sm text-[color:var(--color-muted)]">
              {concessions.length} note{concessions.length !== 1 ? "s" : ""} ·{" "}
              <strong>{formatMoney(concessions.reduce((s, c) => s + c.amount, 0))}</strong> adjusted
            </span>
          </div>
          {concessions.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">No credit notes issued.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={thCls}>Invoice</th>
                    <th className={thCls}>Student</th>
                    <th className={thCls}>Reason</th>
                    <th className={thCls}>Date</th>
                    <th className={thCls + " text-right pr-0"}>Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-line)]">
                  {concessions.map((c) => (
                    <tr key={c.id}>
                      <td className={tdCls}>
                        <Link href={`/portal/fees/invoices/${c.invoice.id}`} className="text-brand-700 hover:underline">
                          {c.invoice.number}
                        </Link>
                      </td>
                      <td className={tdCls}>
                        {c.invoice.student.person.firstName} {c.invoice.student.person.lastName}
                      </td>
                      <td className={tdMuted}>{c.reason}</td>
                      <td className={tdMuted}>{c.createdAt.toLocaleDateString()}</td>
                      <td className="py-2 text-right text-sm font-semibold text-amber-700">
                        {formatMoney(c.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Student Ledger ── */}
      {tab === "ledger" && (
        <div className="space-y-4">
          {ledger.length === 0 ? (
            <Card>
              <p className="text-sm text-[color:var(--color-muted)]">No enrolled students in your scope.</p>
            </Card>
          ) : (
            ledger.map((s) => {
              const totalBilled = s.invoices.reduce((sum, i) => sum + i.total, 0);
              const totalBalance = s.invoices.reduce((sum, i) => sum + i.balance, 0);
              const totalPaid = s.payments.reduce((sum, p) => sum + p.amount, 0);
              return (
                <Card key={s.id}>
                  <div className="mb-3 flex items-start justify-between">
                    <div>
                      <Link href={`/portal/students/${s.id}`} className="font-semibold text-brand-700 hover:underline">
                        {s.person.firstName} {s.person.lastName}
                      </Link>
                      <p className="text-xs text-[color:var(--color-muted)]">{s.admissionNumber}</p>
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-[color:var(--color-muted)]">Billed: <strong>{formatMoney(totalBilled)}</strong></span>
                      <span className="text-green-700">Paid: <strong>{formatMoney(totalPaid)}</strong></span>
                      <span className={totalBalance > 0 ? "text-amber-700" : "text-green-700"}>
                        Balance: <strong>{formatMoney(totalBalance)}</strong>
                      </span>
                    </div>
                  </div>
                  {s.invoices.length === 0 ? (
                    <p className="text-xs text-[color:var(--color-muted)]">No invoices.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                          <th className="pb-1 pr-3">Invoice</th>
                          <th className="pb-1 pr-3">Period</th>
                          <th className="pb-1 pr-3">Status</th>
                          <th className="pb-1 pr-3 text-right">Total</th>
                          <th className="pb-1 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--color-line)]">
                        {s.invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td className="py-1 pr-3">
                              <Link href={`/portal/fees/invoices/${inv.id}`} className="text-brand-700 hover:underline">
                                {inv.number}
                              </Link>
                            </td>
                            <td className="py-1 pr-3 text-[color:var(--color-muted)]">{inv.periodLabel}</td>
                            <td className="py-1 pr-3 text-[color:var(--color-muted)]">{inv.status}</td>
                            <td className="py-1 pr-3 text-right">{formatMoney(inv.total)}</td>
                            <td className={`py-1 text-right font-medium ${inv.balance > 0 ? "text-amber-700" : "text-green-700"}`}>
                              {formatMoney(inv.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              );
            })
          )}
          {ledger.length === 50 && (
            <p className="text-center text-xs text-[color:var(--color-muted)]">
              Showing first 50 students. Use the Students page to find specific records.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
