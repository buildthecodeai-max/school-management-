import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import {
  PIPELINE_STAGES,
  SIDE_STAGES,
  STAGE_META,
  ageInDays,
} from "@/lib/admissions";
import { PageHeader, Card, Badge, StatCard, ButtonLink } from "@/components/ui";
import type { ApplicationStage } from "@prisma/client";

const SOURCE_LABEL: Record<string, string> = {
  WEBSITE: "Website",
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  STAFF: "Staff",
  API: "API",
};

export default async function AdmissionsPage() {
  const ctx = await requirePermission("admissions.read");
  const campusIds = allowedCampusIds(ctx, "admissions.read");

  const applications = await prisma.application.findMany({
    where: {
      tenantId: ctx.tenantId!,
      ...(campusIds ? { campusId: { in: campusIds } } : {}),
    },
    include: {
      applicant: true,
      gradeLevel: true,
      campus: true,
    },
    orderBy: { appliedAt: "desc" },
  });

  const byStage = new Map<ApplicationStage, typeof applications>();
  for (const a of applications) {
    const list = byStage.get(a.stage) ?? [];
    list.push(a);
    byStage.set(a.stage, list);
  }

  const total = applications.length;
  const enrolled = (byStage.get("ENROLLED") ?? []).length;
  const active = applications.filter(
    (a) => a.stage !== "ENROLLED" && !SIDE_STAGES.includes(a.stage),
  ).length;
  const offers = (byStage.get("OFFER") ?? []).length;
  const conversion = total > 0 ? Math.round((enrolled / total) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Admissions"
        subtitle="Lead-to-enrolled pipeline across your campuses."
        action={
          <ButtonLink href="/portal/admissions/new">New application</ButtonLink>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total applications" value={total} />
        <StatCard label="In pipeline" value={active} tone="sky" hint="not yet decided" />
        <StatCard label="Outstanding offers" value={offers} tone="amber" />
        <StatCard
          label="Conversion"
          value={`${conversion}%`}
          tone="green"
          hint={`${enrolled} enrolled`}
        />
      </div>

      {/* Pipeline board */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-3" style={{ minWidth: "min-content" }}>
          {PIPELINE_STAGES.map((stage) => {
            const items = byStage.get(stage) ?? [];
            const meta = STAGE_META[stage];
            return (
              <div key={stage} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold">{meta.label}</span>
                  <Badge tone={meta.tone}>{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-[color:var(--color-line)] p-4 text-center text-xs text-[color:var(--color-muted)]">
                      Empty
                    </div>
                  ) : (
                    items.map((a) => (
                      <Link
                        key={a.id}
                        href={`/portal/admissions/${a.id}`}
                        className="block rounded-lg border border-[color:var(--color-line)] bg-white p-3 transition hover:border-brand-300 hover:shadow-sm"
                      >
                        <p className="text-sm font-medium">
                          {a.applicant.firstName} {a.applicant.lastName}
                        </p>
                        <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">
                          {a.gradeLevel?.name ?? "Grade TBD"} · {a.campus.name}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {SOURCE_LABEL[a.source]}
                          </span>
                          <span className="text-[10px] text-[color:var(--color-muted)]">
                            {ageInDays(a.appliedAt)}d old
                          </span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Side buckets */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SIDE_STAGES.map((stage) => {
          const items = byStage.get(stage) ?? [];
          const meta = STAGE_META[stage];
          return (
            <Card key={stage}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{meta.label}</span>
                <Badge tone={meta.tone}>{items.length}</Badge>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-[color:var(--color-muted)]">None</p>
              ) : (
                <ul className="space-y-1">
                  {items.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/portal/admissions/${a.id}`}
                        className="text-sm text-brand-700 hover:underline"
                      >
                        {a.applicant.firstName} {a.applicant.lastName}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
