import Link from "next/link";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/attendance";
import { PageHeader, Card, Badge, ButtonLink } from "@/components/ui";
import { ActionForm, inputCls } from "@/components/ActionForm";
import { ImportForm } from "./ImportForm";
import { autoReconcile, matchLineManually, unmatchLine, excludeLine, restoreLine } from "../bank-actions";

export const metadata = { title: "Bank reconciliation" };
const STATUSES = ["UNMATCHED", "MATCHED", "MANUAL", "EXCLUDED"] as const;
type Status = (typeof STATUSES)[number];
const TONE: Record<Status, "red" | "green" | "sky" | "slate"> = { UNMATCHED: "red", MATCHED: "green", MANUAL: "sky", EXCLUDED: "slate" };
const BANK_METHODS = ["BANK", "CARD", "CHEQUE", "GATEWAY", "IMPORT"] as const;

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ campusId?: string; status?: string }> }) {
  const ctx = await requirePermission("fee.read");
  const sp = await searchParams;
  const allowed = allowedCampusIds(ctx, "fee.read");
  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE", ...(allowed ? { id: { in: allowed } } : {}) }, orderBy: { name: "asc" } });
  const campusId = campuses.find((c) => c.id === sp.campusId)?.id ?? campuses[0]?.id;
  const status: Status = STATUSES.includes(sp.status as Status) ? (sp.status as Status) : "UNMATCHED";
  const canWrite = campusId ? canForCampus(ctx, "fee.collect", campusId) : false;

  const [lines, summary, openPayments] = campusId
    ? await Promise.all([
        prisma.bankStatementLine.findMany({ where: { tenantId: ctx.tenantId!, campusId, status }, orderBy: { transactionDate: "desc" }, take: 200 }),
        prisma.bankStatementLine.groupBy({ by: ["status"], where: { tenantId: ctx.tenantId!, campusId }, _count: { id: true }, _sum: { amountCents: true } }),
        // Receipts that came in by bank/card/cheque but are not tied to any statement line yet.
        prisma.payment.findMany({
          where: { tenantId: ctx.tenantId!, campusId, status: "CONFIRMED", method: { in: [...BANK_METHODS] }, receivedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } },
          include: { student: { include: { person: true } } },
          orderBy: { receivedAt: "desc" },
          take: 400,
        }),
      ])
    : [[], [], []];
  const matchedIds = new Set(
    (await prisma.bankStatementLine.findMany({ where: { tenantId: ctx.tenantId!, matchedPaymentId: { not: null } }, select: { matchedPaymentId: true } })).map((l) => l.matchedPaymentId!),
  );
  const free = openPayments.filter((p) => !matchedIds.has(p.id));
  const matchedPayments = lines.some((l) => l.matchedPaymentId)
    ? await prisma.payment.findMany({ where: { tenantId: ctx.tenantId!, id: { in: lines.map((l) => l.matchedPaymentId).filter(Boolean) as string[] } }, select: { id: true, number: true } })
    : [];
  const numberOf = new Map(matchedPayments.map((p) => [p.id, p.number]));
  const th = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";

  return (
    <div className="space-y-6">
      <PageHeader title="Bank reconciliation" subtitle="Tie bank credits to payment receipts" action={<ButtonLink href="/portal/fees" variant="ghost">← Fees</ButtonLink>} />
      <div className="flex flex-wrap gap-2">
        {campuses.map((c) => (
          <Link key={c.id} href={`?campusId=${c.id}&status=${status}`} className={`rounded-full px-3 py-1 text-sm font-medium ${c.id === campusId ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"}`}>{c.name}</Link>
        ))}
      </div>

      {canWrite && campusId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><h3 className="mb-3 text-sm font-semibold">Import a statement</h3><ImportForm campusId={campusId} /></Card>
          <Card>
            <h3 className="mb-1 text-sm font-semibold">Match automatically</h3>
            <p className="mb-3 text-xs text-[color:var(--color-muted)]">Matches a credit to a receipt of the same amount within 3 days. A reference in the narrative wins. When several receipts fit, nothing is guessed; you choose below.</p>
            <ActionForm action={autoReconcile} submit="Run auto-match" pendingLabel="Matching…"><input type="hidden" name="campusId" value={campusId} /></ActionForm>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUSES.map((s) => {
          const row = summary.find((r) => r.status === s);
          return (
            <Link key={s} href={`?campusId=${campusId}&status=${s}`} className={`card p-3 text-center hover:opacity-90 ${s === status ? "ring-2 ring-brand-500" : ""}`}>
              <p className="text-2xl font-bold">{row?._count.id ?? 0}</p>
              <Badge tone={TONE[s]}>{s}</Badge>
              <p className="mt-1 text-xs text-[color:var(--color-muted)]">{formatMoney(Math.abs(row?._sum.amountCents ?? 0))}</p>
            </Link>
          );
        })}
      </div>

      <Card className="overflow-x-auto">
        <h3 className="mb-3 text-sm font-semibold">{status.charAt(0) + status.slice(1).toLowerCase()} lines</h3>
        {lines.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">Nothing here.</p> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Date</th><th className={th}>Reference</th><th className={th}>Description</th><th className={`${th} text-right`}>Amount</th>{canWrite && <th className={th}>Action</th>}</tr></thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {lines.map((l) => {
                const cands = free.filter((p) => p.amount === l.amountCents);
                return (
                  <tr key={l.id} className="align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">{formatDay(l.transactionDate)}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{l.reference ?? "—"}</td>
                    <td className="py-2 pr-4">{l.description ?? "—"}{l.note && <span className="block text-xs text-[color:var(--color-muted)]">{l.note}</span>}</td>
                    <td className={`py-2 pr-4 text-right font-medium ${l.amountCents < 0 ? "text-red-600" : "text-emerald-700"}`}>{l.amountCents < 0 ? "−" : "+"}{formatMoney(Math.abs(l.amountCents))}</td>
                    {canWrite && (
                      <td className="space-y-2 py-2">
                        {l.matchedPaymentId && <p className="text-xs">→ <Link className="text-brand-700 hover:underline" href={`/portal/fees/receipt/${l.matchedPaymentId}`}>{numberOf.get(l.matchedPaymentId) ?? "receipt"}</Link></p>}
                        {l.status === "UNMATCHED" && l.amountCents > 0 && (
                          cands.length > 0 ? (
                            <ActionForm action={matchLineManually} submit="Match" pendingLabel="…" className="flex items-center gap-1">
                              <input type="hidden" name="lineId" value={l.id} />
                              <select name="paymentId" className={inputCls}>{cands.map((p) => <option key={p.id} value={p.id}>{p.number} · {p.student.person.firstName} {p.student.person.lastName} · {formatDay(p.receivedAt)}</option>)}</select>
                            </ActionForm>
                          ) : <p className="text-xs text-[color:var(--color-muted)]">No receipt of this amount is waiting.</p>
                        )}
                        {l.status === "UNMATCHED" && (
                          <ActionForm action={excludeLine} submit="Set aside" variant="ghost" className="flex items-center gap-1">
                            <input type="hidden" name="lineId" value={l.id} /><input name="note" required minLength={3} placeholder="Why (e.g. bank charge)" className={inputCls} />
                          </ActionForm>
                        )}
                        {(l.status === "MATCHED" || l.status === "MANUAL") && <ActionForm action={unmatchLine} submit="Unmatch" variant="ghost" confirmText="Remove this match?"><input type="hidden" name="lineId" value={l.id} /></ActionForm>}
                        {l.status === "EXCLUDED" && <ActionForm action={restoreLine} submit="Restore" variant="ghost"><input type="hidden" name="lineId" value={l.id} /></ActionForm>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <h3 className="mb-1 text-sm font-semibold">Receipts not on any statement ({free.length})</h3>
        <p className="mb-3 text-xs text-[color:var(--color-muted)]">Bank, card, cheque and gateway receipts from the last 90 days with no matching bank line. Money recorded but not seen at the bank.</p>
        {free.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">Every such receipt is matched.</p> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Receipt</th><th className={th}>Date</th><th className={th}>Student</th><th className={th}>Method</th><th className={`${th} text-right`}>Amount</th></tr></thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {free.slice(0, 100).map((p) => (
                <tr key={p.id}><td className="py-2 pr-4"><Link className="text-brand-700 hover:underline" href={`/portal/fees/receipt/${p.id}`}>{p.number}</Link></td><td className="py-2 pr-4">{formatDay(p.receivedAt)}</td><td className="py-2 pr-4">{p.student.person.firstName} {p.student.person.lastName}</td><td className="py-2 pr-4">{p.method}</td><td className="py-2 text-right">{formatMoney(p.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
