import { prisma } from "@/lib/db";
import { StatCard, PageHeader } from "@/components/ui";

export async function PlatformDashboard() {
  const [tenants, trials, active, suspended, subs] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenant.count({ where: { status: "TRIAL" } }),
    prisma.tenant.count({ where: { status: "ACTIVE" } }),
    prisma.tenant.count({ where: { status: "SUSPENDED" } }),
    prisma.subscription.findMany({
      include: { tenant: true, plan: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const mrrCents = subs
    .filter((s) => s.status === "ACTIVE" || s.status === "TRIAL")
    .reduce((sum, s) => sum + s.plan.priceMonthly, 0);

  return (
    <div>
      <PageHeader
        title="Platform operations"
        subtitle="Tenant registry, subscriptions and service health."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total tenants" value={tenants} />
        <StatCard label="Active" value={active} tone="green" />
        <StatCard label="Trials" value={trials} tone="sky" />
        <StatCard label="Suspended" value={suspended} tone="amber" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StatCard
          label="Indicative MRR"
          value={`$${(mrrCents / 100).toLocaleString()}`}
          tone="brand"
          hint="sum of active + trial plan prices"
        />
        <StatCard
          label="Indicative ARR"
          value={`$${((mrrCents * 12) / 100).toLocaleString()}`}
          tone="brand"
        />
        <StatCard label="Subscriptions" value={subs.length} tone="slate" />
      </div>
    </div>
  );
}
