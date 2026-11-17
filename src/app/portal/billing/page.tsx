import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, StatCard } from "@/components/ui";

export default async function BillingPage() {
  const ctx = await requirePermission("billing.read");

  const sub = await prisma.subscription.findUnique({
    where: { tenantId: ctx.tenantId! },
    include: { plan: true },
  });

  const [studentCount, campusCount] = await Promise.all([
    prisma.enrollment.count({
      where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    }),
    prisma.campus.count({
      where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    }),
  ]);

  if (!sub) {
    return (
      <div>
        <PageHeader title="Subscription" />
        <Card>
          <p className="text-sm text-[color:var(--color-muted)]">
            No subscription on file.
          </p>
        </Card>
      </div>
    );
  }

  const studentPct = Math.min(
    100,
    Math.round((studentCount / sub.plan.maxStudents) * 100),
  );
  const campusPct = Math.min(
    100,
    Math.round((campusCount / sub.plan.maxCampuses) * 100),
  );

  return (
    <div>
      <PageHeader
        title="Subscription"
        subtitle="Your plan, entitlements and usage against limits."
        action={
          <Badge
            tone={
              sub.status === "ACTIVE"
                ? "green"
                : sub.status === "TRIAL"
                  ? "sky"
                  : "amber"
            }
          >
            {sub.status}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-[color:var(--color-muted)]">Current plan</p>
          <p className="mt-1 text-2xl font-semibold">{sub.plan.name}</p>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            ${(sub.plan.priceMonthly / 100).toLocaleString()} / month ·{" "}
            {sub.plan.currency}
          </p>
          <p className="mt-4 text-sm">
            Renews:{" "}
            <span className="font-medium">
              {sub.currentPeriodEnd
                ? sub.currentPeriodEnd.toLocaleDateString()
                : "—"}
            </span>
          </p>
        </Card>

        <UsageCard
          label="Students"
          used={studentCount}
          limit={sub.plan.maxStudents}
          pct={studentPct}
        />
        <UsageCard
          label="Campuses"
          used={campusCount}
          limit={sub.plan.maxCampuses}
          pct={campusPct}
        />
      </div>

      <div className="mt-6">
        <Card>
          <h3 className="mb-3 font-semibold">Entitlements</h3>
          <div className="flex flex-wrap gap-2">
            {sub.plan.features.map((f) => (
              <Badge key={f} tone="brand">
                {f}
              </Badge>
            ))}
          </div>
          <p className="mt-4 text-xs text-[color:var(--color-muted)]">
            Entitlements and limits are evaluated server-side (BIL-002). Actions
            that would exceed a limit are blocked with upgrade guidance.
          </p>
        </Card>
      </div>
    </div>
  );
}

function UsageCard({
  label,
  used,
  limit,
  pct,
}: {
  label: string;
  used: number;
  limit: number;
  pct: number;
}) {
  const tone = pct >= 90 ? "amber" : "green";
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-[color:var(--color-muted)]">{label}</p>
        <p className="text-sm font-medium">
          {used.toLocaleString()} / {limit.toLocaleString()}
        </p>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${tone === "amber" ? "bg-amber-500" : "bg-green-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-[color:var(--color-muted)]">
        {pct}% of plan limit used
      </p>
    </div>
  );
}
