import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { MarkImporter } from "./MarkImporter";

export default async function MarkImportPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string }>;
}) {
  const ctx = await requirePermission("data.import");
  const campusIds = allowedCampusIds(ctx, "data.import");
  const params = await searchParams;

  const plans = await prisma.assessmentPlan.findMany({
    where: {
      tenantId: ctx.tenantId!,
      status: { in: ["OPEN", "SUBMITTED"] },
      ...(campusIds ? { campusId: { in: campusIds } } : {}),
    },
    include: {
      section: { include: { gradeLevel: true, campus: true } },
      term: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const selectedPlan = params.planId ? plans.find((p) => p.id === params.planId) : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <Link href="/portal/import" className="text-sm text-brand-700 hover:underline">
          ← Import centre
        </Link>
      </div>
      <PageHeader
        title="Mark import"
        subtitle="Upload a CSV to bulk-enter marks into an assessment plan. Valid rows upsert; invalid rows are skipped."
      />

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium">Select assessment plan</label>
        <form method="get">
          <select
            name="planId"
            defaultValue={params.planId ?? ""}
            onChange={(e) => (window.location.href = `?planId=${e.target.value}`)}
            className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm"
          >
            <option value="" disabled>Choose a plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.section.campus.name} · {p.section.gradeLevel.name} {p.section.name} · {p.name} ({p.term.name})
              </option>
            ))}
          </select>
        </form>
      </div>

      {selectedPlan ? (
        <MarkImporter
          planId={selectedPlan.id}
          planName={`${selectedPlan.section.campus.name} — ${selectedPlan.section.gradeLevel.name} ${selectedPlan.section.name} — ${selectedPlan.name}`}
        />
      ) : (
        <p className="text-sm text-[color:var(--color-muted)]">Select a plan above to begin.</p>
      )}
    </div>
  );
}
