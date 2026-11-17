import Link from "next/link";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { resolveBillingPreview } from "@/lib/finance-server";
import { formatMoney } from "@/lib/money";
import { PageHeader, Card, Badge } from "@/components/ui";
import { BillingForm } from "./BillingForm";
import { postBillingRun } from "../actions";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string; structureId?: string; period?: string; due?: string }>;
}) {
  const ctx = await requirePermission("fee.bill");
  const campusIds = allowedCampusIds(ctx, "fee.bill");
  const sp = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: {
      tenantId: ctx.tenantId!,
      status: "ACTIVE",
      ...(campusIds ? { id: { in: campusIds } } : {}),
    },
    include: {
      feeStructures: { where: { active: true, OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }] }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });

  const period = sp.period || "Term 1 · 2025–26";
  const preview = sp.structureId
    ? await resolveBillingPreview(ctx.tenantId!, sp.structureId, period)
    : null;

  const eligible = preview?.rows.filter((r) => !r.alreadyInvoiced) ?? [];
  const skipped = preview?.rows.filter((r) => r.alreadyInvoiced) ?? [];
  const totalToBill = eligible.reduce((s, r) => s + r.total, 0);
  const allowedForCampus =
    preview && canForCampus(ctx, "fee.bill", preview.structure.campusId);

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/fees" className="text-sm text-brand-700 hover:underline">
          ← Finance
        </Link>
      </div>
      <PageHeader
        title="Run billing"
        subtitle="Preview eligible students and totals, then post invoices. Re-running the same period is safe — already-invoiced students are skipped."
      />

      <Card className="mb-4">
        <BillingForm
          campuses={campuses.map((c) => ({
            id: c.id,
            name: c.name,
            structures: c.feeStructures.map((s) => ({ id: s.id, name: s.name })),
          }))}
          initial={{ campusId: sp.campusId, structureId: sp.structureId, period, due: sp.due }}
        />
      </Card>

      {preview && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">{preview.structure.name}</h3>
              <p className="text-sm text-[color:var(--color-muted)]">
                {eligible.length} to bill · {skipped.length} already invoiced for “{period}”
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">{formatMoney(totalToBill)}</span>
              {allowedForCampus && eligible.length > 0 && (
                <form action={postBillingRun}>
                  <input type="hidden" name="feeStructureId" value={preview.structure.id} />
                  <input type="hidden" name="periodLabel" value={period} />
                  <input type="hidden" name="dueDate" value={sp.due ?? ""} />
                  <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                    Post {eligible.length} invoice{eligible.length === 1 ? "" : "s"}
                  </button>
                </form>
              )}
            </div>
          </div>

          {preview.rows.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">
              No active students match this structure&apos;s campus and grade.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                    <th className="py-2 pr-4 font-medium">Student</th>
                    <th className="py-2 pr-4 font-medium">Admission</th>
                    <th className="py-2 pr-4 font-medium">Discount</th>
                    <th className="py-2 pr-4 font-medium">Amount</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.studentId} className="border-b border-[color:var(--color-line)] last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.name}</td>
                      <td className="py-2 pr-4 text-[color:var(--color-muted)]">{r.admissionNumber}</td>
                      <td className="py-2 pr-4">{r.discountPct > 0 ? `${r.discountPct}%` : "—"}</td>
                      <td className="py-2 pr-4">{formatMoney(r.total)}</td>
                      <td className="py-2 pr-4">
                        {r.alreadyInvoiced ? (
                          <Badge tone="slate">Already invoiced</Badge>
                        ) : (
                          <Badge tone="green">To bill</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!allowedForCampus && (
            <p className="mt-3 text-xs text-amber-600">
              You do not have billing rights for this campus.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
