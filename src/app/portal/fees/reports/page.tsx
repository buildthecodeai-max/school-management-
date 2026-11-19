import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { dayStart } from "@/lib/dates";
import { parseDay, formatDay } from "@/lib/attendance";
import { AGING_BUCKETS } from "@/lib/fee-report-calc";
import { campusNames, collectionsReport, discountsReport, outstandingReport, refundsReport } from "@/lib/fee-reports";
import { PageHeader, Card, Badge, ButtonLink, EmptyState } from "@/components/ui";
import { inputCls, labelCls } from "@/components/ActionForm";

const TABS = [
  { key: "collections", label: "Collections" },
  { key: "outstanding", label: "Outstanding & overdue" },
  { key: "discounts", label: "Discounts & write-offs" },
  { key: "refunds", label: "Refunds" },
  { key: "ledger", label: "Student ledger" },
] as const;
type Tab = (typeof TABS)[number]["key"];
const METHODS = ["CASH", "BANK", "CARD", "WALLET", "CHEQUE", "GATEWAY", "IMPORT"];

export default async function FeeReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string; campusId?: string; method?: string; gradeLevelId?: string; admission?: string }>;
}) {
  const ctx = await requirePermission("fee.read");
  const sp = await searchParams;
  const allowed = allowedCampusIds(ctx, "fee.read");
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "collections";
  const names = await campusNames(ctx.tenantId!);
  const campusOptions = [...names].filter(([id]) => !allowed || allowed.includes(id));
  const campusId = campusOptions.some(([id]) => id === sp.campusId) ? sp.campusId : undefined;

  const today = dayStart();
  const from = parseDay(sp.from) ?? new Date(today.getFullYear(), today.getMonth(), 1);
  const to = parseDay(sp.to) ?? today;
  const rangeError = from > to ? "The start date must not be after the end date." : null;
  const method = METHODS.includes(sp.method ?? "") ? sp.method : undefined;
  const grades = await prisma.gradeLevel.findMany({
    where: { tenantId: ctx.tenantId!, ...(allowed ? { campusId: { in: allowed } } : {}) },
    orderBy: [{ rank: "asc" }, { name: "asc" }],
    select: { id: true, name: true, campusId: true },
  });
  const gradeLevelId = grades.some((g) => g.id === sp.gradeLevelId) ? sp.gradeLevelId : undefined;
  const scope = { tenantId: ctx.tenantId!, campusIds: allowed, campusId };

  const q = new URLSearchParams({ from: formatDay(from), to: formatDay(to) });
  if (campusId) q.set("campusId", campusId);
  if (method) q.set("method", method);
  if (gradeLevelId) q.set("gradeLevelId", gradeLevelId);
  const csv = (report: string) => `/api/portal/fees/reports/export?${q}&report=${report}`;

  const data = rangeError ? null : {
    collections: tab === "collections" ? await collectionsReport({ ...scope, from, to, method }) : null,
    outstanding: tab === "outstanding" ? await outstandingReport({ ...scope, gradeLevelId, asOf: new Date() }) : null,
    discounts: tab === "discounts" ? await discountsReport({ ...scope, from, to }) : null,
    refunds: tab === "refunds" ? await refundsReport({ ...scope, from, to }) : null,
  };

  // Ledger: one student at a time, found by admission number.
  let ledger: Awaited<ReturnType<typeof loadLedger>> = null;
  async function loadLedger() {
    const adm = sp.admission?.trim();
    if (!adm) return null;
    return prisma.student.findFirst({
      where: { tenantId: ctx.tenantId!, admissionNumber: adm, ...(allowed ? { enrollments: { some: { campusId: { in: allowed } } } } : {}) },
      include: { person: true, invoices: { orderBy: { issueDate: "desc" }, take: 50 }, payments: { orderBy: { receivedAt: "desc" }, take: 50 } },
    });
  }
  if (tab === "ledger") ledger = await loadLedger();

  const th = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";
  const showDates = tab !== "outstanding" && tab !== "ledger";
  const tabHref = (k: string) => `?${new URLSearchParams({ ...Object.fromEntries(q), tab: k })}`;
  const Stat = ({ label, value }: { label: string; value: string }) => (
    <Card><p className="text-xs text-[color:var(--color-muted)]">{label}</p><p className="text-2xl font-semibold">{value}</p></Card>
  );

  return (
    <div>
      <PageHeader title="Fee reports" subtitle="Collections, overdue balances, discounts, refunds and student ledgers" action={<ButtonLink href="/portal/fees" variant="ghost">← Fees</ButtonLink>} />

      <div className="mb-4 flex flex-wrap gap-5 border-b border-[color:var(--color-line)]">
        {TABS.map((t) => (
          <Link key={t.key} href={tabHref(t.key)} className={t.key === tab ? "border-b-2 border-brand-700 pb-2 text-sm font-semibold text-brand-700" : "pb-2 text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"}>{t.label}</Link>
        ))}
      </div>

      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="tab" value={tab} />
          {showDates && (
            <>
              <label><span className={labelCls}>From</span><input type="date" name="from" defaultValue={formatDay(from)} className={inputCls} /></label>
              <label><span className={labelCls}>To</span><input type="date" name="to" defaultValue={formatDay(to)} className={inputCls} /></label>
            </>
          )}
          {tab !== "ledger" && campusOptions.length > 1 && (
            <label><span className={labelCls}>Campus</span>
              <select name="campusId" defaultValue={campusId ?? ""} className={inputCls}><option value="">All campuses</option>{campusOptions.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
          )}
          {tab === "collections" && (
            <label><span className={labelCls}>Method</span>
              <select name="method" defaultValue={method ?? ""} className={inputCls}><option value="">All methods</option>{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          )}
          {tab === "outstanding" && (
            <label><span className={labelCls}>Grade</span>
              <select name="gradeLevelId" defaultValue={gradeLevelId ?? ""} className={inputCls}><option value="">All grades</option>{grades.map((g) => <option key={g.id} value={g.id}>{g.name}{campusOptions.length > 1 ? ` (${names.get(g.campusId)})` : ""}</option>)}</select></label>
          )}
          {tab === "ledger" && (
            <label><span className={labelCls}>Admission number</span><input name="admission" defaultValue={sp.admission ?? ""} className={inputCls} /></label>
          )}
          <button className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">Run report</button>
          {tab !== "ledger" && <a href={csv(tab)} className="rounded-lg bg-white px-3 py-2 font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">Download CSV</a>}
        </form>
        {rangeError && <p className="mt-3 text-sm text-red-700">{rangeError}</p>}
      </Card>

      {data?.collections && (() => {
        const d = data.collections;
        return (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Collected" value={formatMoney(d.total)} />
              <Stat label="Receipts" value={String(d.rows.length)} />
              {d.byMethod.slice(0, 2).map((m) => <Stat key={m.key} label={m.key} value={formatMoney(m.total)} />)}
            </div>
            {d.truncated && <p className="mb-3 text-sm text-amber-700">Showing the first 5,000 receipts. Narrow the dates.</p>}
            {d.rows.length === 0 ? <EmptyState title="No collections in this range" hint="Widen the dates or clear the filters." /> : (
              <div className="grid gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr><th className={th}>Receipt</th><th className={th}>Date</th><th className={th}>Student</th><th className={th}>Method</th><th className={`${th} text-right`}>Amount</th></tr></thead>
                    <tbody className="divide-y divide-[color:var(--color-line)]">
                      {[...d.rows].reverse().map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 pr-4"><Link href={`/portal/fees/receipt/${p.id}`} className="text-brand-700 hover:underline">{p.number}</Link></td>
                          <td className="py-2 pr-4 whitespace-nowrap">{formatDay(p.receivedAt)}</td>
                          <td className="py-2 pr-4">{p.student.person.firstName} {p.student.person.lastName}</td>
                          <td className="py-2 pr-4">{p.method}</td>
                          <td className="py-2 text-right">{formatMoney(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
                <div className="space-y-6">
                  <Card>
                    <h3 className="mb-2 text-sm font-semibold">By method</h3>
                    {d.byMethod.map((m) => <p key={m.key} className="flex justify-between text-sm"><span>{m.key} <span className="text-[color:var(--color-muted)]">({m.count})</span></span><span>{formatMoney(m.total)}</span></p>)}
                  </Card>
                  <Card>
                    <h3 className="mb-2 text-sm font-semibold">By day</h3>
                    <div className="max-h-64 overflow-y-auto">{d.byDay.map((m) => <p key={m.key} className="flex justify-between text-sm"><span>{m.key}</span><span>{formatMoney(m.total)}</span></p>)}</div>
                  </Card>
                </div>
              </div>
            )}
          </>
        );
      })()}

      {data?.outstanding && (() => {
        const d = data.outstanding;
        return (
          <>
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total outstanding" value={formatMoney(d.total)} />
              <Stat label="Overdue" value={formatMoney(d.overdueTotal)} />
              <Stat label="Open invoices" value={String(d.rows.length)} />
            </div>
            {d.truncated && <p className="mb-3 text-sm text-amber-700">Showing the first 5,000 invoices. Filter by campus or grade.</p>}
            {d.rows.length === 0 ? <EmptyState title="Nothing outstanding" hint="Every invoice in scope is paid." /> : (
              <>
                <Card className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold">Aging</h3>
                  <div className="grid gap-2 sm:grid-cols-5">
                    {AGING_BUCKETS.map((b) => {
                      const x = d.byBucket.find((r) => r.key === b);
                      return <div key={b} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-[color:var(--color-muted)]">{b}</p><p className="font-semibold">{formatMoney(x?.total ?? 0)}</p><p className="text-xs text-[color:var(--color-muted)]">{x?.count ?? 0} invoice(s)</p></div>;
                    })}
                  </div>
                </Card>
                <Card className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr><th className={th}>Invoice</th><th className={th}>Student</th><th className={th}>Campus</th><th className={th}>Due</th><th className={th}>Aging</th><th className={`${th} text-right`}>Balance</th></tr></thead>
                    <tbody className="divide-y divide-[color:var(--color-line)]">
                      {d.rows.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 pr-4"><Link href={`/portal/fees/invoices/${r.id}`} className="text-brand-700 hover:underline">{r.number}</Link></td>
                          <td className="py-2 pr-4">{r.student.person.firstName} {r.student.person.lastName} <span className="text-xs text-[color:var(--color-muted)]">{r.student.admissionNumber}</span></td>
                          <td className="py-2 pr-4 text-[color:var(--color-muted)]">{names.get(r.campusId)}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">{formatDay(r.dueDate)}</td>
                          <td className="py-2 pr-4"><Badge tone={r.overdueDays === 0 ? "green" : r.overdueDays <= 30 ? "amber" : "red"}>{r.bucket}</Badge></td>
                          <td className="py-2 text-right font-medium">{formatMoney(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </>
            )}
          </>
        );
      })()}

      {data?.discounts && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4"><Stat label="Total discounts & write-offs" value={formatMoney(data.discounts.total)} /><Stat label="Entries" value={String(data.discounts.rows.length)} /></div>
          {data.discounts.rows.length === 0 ? <EmptyState title="None in this range" hint="Credit notes and write-offs appear here." /> : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Date</th><th className={th}>Invoice</th><th className={th}>Student</th><th className={th}>Reason</th><th className={`${th} text-right`}>Amount</th></tr></thead>
                <tbody className="divide-y divide-[color:var(--color-line)]">
                  {[...data.discounts.rows].reverse().map((n) => (
                    <tr key={n.id}><td className="py-2 pr-4">{formatDay(n.createdAt)}</td><td className="py-2 pr-4">{n.invoice.number}</td><td className="py-2 pr-4">{n.invoice.student.person.firstName} {n.invoice.student.person.lastName}</td><td className="py-2 pr-4">{n.reason}</td><td className="py-2 text-right">{formatMoney(n.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {data?.refunds && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4"><Stat label="Total refunded" value={formatMoney(data.refunds.total)} /><Stat label="Refunds" value={String(data.refunds.rows.length)} /></div>
          {data.refunds.rows.length === 0 ? <EmptyState title="No refunds in this range" hint="Approved refunds appear here." /> : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Date</th><th className={th}>Student</th><th className={th}>Method</th><th className={th}>Reason</th><th className={`${th} text-right`}>Amount</th></tr></thead>
                <tbody className="divide-y divide-[color:var(--color-line)]">
                  {[...data.refunds.rows].reverse().map((r) => (
                    <tr key={r.id}><td className="py-2 pr-4">{formatDay(r.createdAt)}</td><td className="py-2 pr-4">{r.student.name} <span className="text-xs text-[color:var(--color-muted)]">{r.student.admissionNumber}</span></td><td className="py-2 pr-4">{r.method}</td><td className="py-2 pr-4">{r.reason}</td><td className="py-2 text-right">{formatMoney(r.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {tab === "ledger" && (
        sp.admission ? (
          ledger ? (
            <div className="space-y-6">
              <Card><p className="font-semibold">{ledger.person.firstName} {ledger.person.lastName} <span className="text-sm font-normal text-[color:var(--color-muted)]">{ledger.admissionNumber}</span></p></Card>
              <Card className="overflow-x-auto">
                <h3 className="mb-2 text-sm font-semibold">Invoices</h3>
                {ledger.invoices.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">None.</p> : (
                  <table className="w-full text-sm">
                    <thead><tr><th className={th}>Invoice</th><th className={th}>Issued</th><th className={th}>Status</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Balance</th></tr></thead>
                    <tbody className="divide-y divide-[color:var(--color-line)]">{ledger.invoices.map((i) => <tr key={i.id}><td className="py-2 pr-4"><Link href={`/portal/fees/invoices/${i.id}`} className="text-brand-700 hover:underline">{i.number}</Link></td><td className="py-2 pr-4">{formatDay(i.issueDate)}</td><td className="py-2 pr-4">{i.status}</td><td className="py-2 pr-4 text-right">{formatMoney(i.total)}</td><td className="py-2 text-right">{formatMoney(i.balance)}</td></tr>)}</tbody>
                  </table>
                )}
              </Card>
              <Card className="overflow-x-auto">
                <h3 className="mb-2 text-sm font-semibold">Payments</h3>
                {ledger.payments.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">None.</p> : (
                  <table className="w-full text-sm">
                    <thead><tr><th className={th}>Receipt</th><th className={th}>Date</th><th className={th}>Method</th><th className={th}>Status</th><th className={`${th} text-right`}>Amount</th></tr></thead>
                    <tbody className="divide-y divide-[color:var(--color-line)]">{ledger.payments.map((p) => <tr key={p.id}><td className="py-2 pr-4"><Link href={`/portal/fees/receipt/${p.id}`} className="text-brand-700 hover:underline">{p.number}</Link></td><td className="py-2 pr-4">{formatDay(p.receivedAt)}</td><td className="py-2 pr-4">{p.method}</td><td className="py-2 pr-4">{p.status}</td><td className="py-2 text-right">{formatMoney(p.amount)}</td></tr>)}</tbody>
                  </table>
                )}
              </Card>
            </div>
          ) : <EmptyState title="Student not found" hint="Check the admission number and your campus access." />
        ) : <EmptyState title="Find a student" hint="Enter an admission number to see their invoices and payments." />
      )}
    </div>
  );
}
