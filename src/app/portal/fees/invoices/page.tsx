import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { formatMoney } from "@/lib/money";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import type { InvoiceStatus } from "@prisma/client";

const STATUS_TONE: Record<InvoiceStatus, "green" | "amber" | "sky" | "slate"> = {
  PAID: "green",
  PARTIAL: "amber",
  OPEN: "sky",
  VOID: "slate",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; posted?: string }>;
}) {
  const ctx = await requirePermission("fee.read");
  const campusIds = allowedCampusIds(ctx, "fee.read");
  const sp = await searchParams;
  const status = sp.status as InvoiceStatus | undefined;

  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: ctx.tenantId!,
      ...(campusIds ? { campusId: { in: campusIds } } : {}),
      ...(status ? { status } : {}),
    },
    include: { student: { include: { person: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const filters: (InvoiceStatus | "ALL")[] = ["ALL", "OPEN", "PARTIAL", "PAID"];

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/fees" className="text-sm text-brand-700 hover:underline">
          ← Finance
        </Link>
      </div>
      <PageHeader title="Invoices" subtitle={`${invoices.length} invoice${invoices.length === 1 ? "" : "s"} in your scope`} />

      {sp.posted && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 ring-1 ring-inset ring-green-200">
          Posted {sp.posted} invoice{sp.posted === "1" ? "" : "s"} successfully. Guardians have been notified.
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {filters.map((f) => {
          const active = (f === "ALL" && !status) || f === status;
          const href = f === "ALL" ? "/portal/fees/invoices" : `/portal/fees/invoices?status=${f}`;
          return (
            <Link
              key={f}
              href={href}
              className={`rounded-full px-3 py-1 text-sm ${active ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"}`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </Link>
          );
        })}
      </div>

      {invoices.length === 0 ? (
        <EmptyState title="No invoices" hint="Run a billing cycle to post invoices." />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                  <th className="px-5 py-3 font-medium">Invoice</th>
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Period</th>
                  <th className="px-5 py-3 font-medium">Due</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Balance</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-b border-[color:var(--color-line)] last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/portal/fees/invoices/${i.id}`} className="font-medium text-brand-700 hover:underline">
                        {i.number}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{i.student.person.firstName} {i.student.person.lastName}</td>
                    <td className="px-5 py-3 text-[color:var(--color-muted)]">{i.periodLabel}</td>
                    <td className="px-5 py-3">{i.dueDate.toLocaleDateString()}</td>
                    <td className="px-5 py-3">{formatMoney(i.total)}</td>
                    <td className="px-5 py-3 font-medium">{formatMoney(i.balance)}</td>
                    <td className="px-5 py-3"><Badge tone={STATUS_TONE[i.status]}>{i.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
