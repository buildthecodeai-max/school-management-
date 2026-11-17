import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import Link from "next/link";

export const metadata = { title: "Bank Reconciliation" };

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string; status?: string }>;
}) {
  const ctx = await requirePermission("fee.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const campusId = params.campusId ?? campuses[0]?.id;
  const statusFilter = (params.status as "UNMATCHED" | "MATCHED" | "MANUAL" | "EXCLUDED" | undefined) ?? "UNMATCHED";

  const canWrite = campusId ? canForCampus(ctx, "fee.bill", campusId) : false;

  const lines = campusId
    ? await prisma.bankStatementLine.findMany({
        where: { tenantId: ctx.tenantId!, campusId, status: statusFilter },
        orderBy: { transactionDate: "desc" },
        take: 100,
      })
    : [];

  const summary = campusId
    ? await prisma.bankStatementLine.groupBy({
        by: ["status"],
        where: { tenantId: ctx.tenantId!, campusId },
        _count: { id: true },
        _sum: { amountCents: true },
      })
    : [];

  const statusColors: Record<string, string> = {
    UNMATCHED: "text-red-600 bg-red-50",
    MATCHED: "text-emerald-700 bg-emerald-50",
    MANUAL: "text-blue-700 bg-blue-50",
    EXCLUDED: "text-gray-500 bg-gray-50",
  };

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bank Reconciliation</h1>
        <Link href="/portal/fees" className="text-sm text-indigo-600 hover:underline">
          ← Fees
        </Link>
      </div>

      {/* Campus tabs */}
      <div className="flex gap-2 flex-wrap">
        {campuses.map((c) => (
          <a
            key={c.id}
            href={`?campusId=${c.id}&status=${statusFilter}`}
            className={`rounded-full px-3 py-1 text-sm font-medium border ${
              c.id === campusId
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {c.name}
          </a>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["UNMATCHED", "MATCHED", "MANUAL", "EXCLUDED"] as const).map((s) => {
          const row = summary.find((r) => r.status === s);
          return (
            <a
              key={s}
              href={`?campusId=${campusId}&status=${s}`}
              className={`rounded border p-3 text-center hover:opacity-80 ${s === statusFilter ? "ring-2 ring-indigo-500" : ""}`}
            >
              <div className="text-2xl font-bold">{row?._count.id ?? 0}</div>
              <div className={`text-xs font-medium mt-1 rounded px-1 inline-block ${statusColors[s]}`}>{s}</div>
              <div className="text-xs text-gray-500 mt-1">
                {formatMoney(Math.abs(row?._sum.amountCents ?? 0))}
              </div>
            </a>
          );
        })}
      </div>

      {/* Lines table */}
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs uppercase text-gray-500">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Reference</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Status</th>
              {canWrite && <th className="px-3 py-2 text-left">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                  No {statusFilter.toLowerCase()} lines for this campus.
                </td>
              </tr>
            )}
            {lines.map((line) => (
              <tr key={line.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{line.transactionDate.toLocaleDateString()}</td>
                <td className="px-3 py-2 font-mono text-xs">{line.reference ?? "—"}</td>
                <td className="px-3 py-2">{line.description ?? "—"}</td>
                <td className={`px-3 py-2 text-right font-medium ${line.amountCents < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {line.amountCents < 0 ? "-" : "+"}{formatMoney(Math.abs(line.amountCents))}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${statusColors[line.status]}`}>
                    {line.status}
                  </span>
                </td>
                {canWrite && (
                  <td className="px-3 py-2">
                    {line.status === "UNMATCHED" && (
                      <span className="text-xs text-gray-400">Match manually</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
