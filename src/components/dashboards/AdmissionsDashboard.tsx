import { prisma } from "@/lib/db";
import type { AuthzContext } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { StatCard, Card, PageHeader, ButtonLink, Badge } from "@/components/ui";

export async function AdmissionsDashboard({ ctx }: { ctx: AuthzContext }) {
  const tenantId = ctx.tenantId!;
  // Match the campus scoping the pipeline page applies, so a campus-scoped
  // officer's dashboard totals cover the same applications the list shows.
  const campusIds = allowedCampusIds(ctx, "admissions.read");
  const campusWhere = campusIds ? { campusId: { in: campusIds } } : {};

  const [stageCounts, recentApps] = await Promise.all([
    prisma.application.groupBy({
      by: ["stage"],
      where: { tenantId, ...campusWhere, stage: { notIn: ["WITHDRAWN"] } },
      _count: { id: true },
    }),
    prisma.application.findMany({
      where: { tenantId, ...campusWhere, stage: { notIn: ["WITHDRAWN", "ENROLLED"] } },
      include: { applicant: true, campus: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const total = stageCounts.reduce((s, r) => s + r._count.id, 0);
  const offerStage = stageCounts.find((r) => r.stage === "OFFER")?._count.id ?? 0;
  const interviewStage = stageCounts.find((r) => r.stage === "INTERVIEW")?._count.id ?? 0;

  return (
    <div>
      <PageHeader
        title="Admissions Dashboard"
        subtitle="Application pipeline overview"
        action={<ButtonLink href="/portal/admissions">View pipeline</ButtonLink>}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Active applications" value={total} tone="sky" hint="excluding withdrawn" />
        <StatCard label="Awaiting interview" value={interviewStage} tone="amber" hint="in interview stage" />
        <StatCard label="Offers out" value={offerStage} tone="green" hint="pending acceptance" />
      </div>

      <div className="mt-6">
        <Card>
          <h3 className="mb-3 font-semibold">Pipeline by stage</h3>
          {stageCounts.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">No active applications.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-line)]">
              {stageCounts.map((s) => (
                <li key={s.stage} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium">{s.stage.replace(/_/g, " ")}</span>
                  <Badge tone="sky">{s._count.id}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <h3 className="mb-3 font-semibold">Recent applications</h3>
          {recentApps.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">None.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-line)]">
              {recentApps.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <a href={`/portal/admissions/${a.id}`} className="font-medium hover:underline text-indigo-700">
                      {a.applicant.firstName} {a.applicant.lastName}
                    </a>
                    <span className="ml-2 text-[color:var(--color-muted)]">{a.campus.name}</span>
                  </div>
                  <Badge tone="amber">{a.stage.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
