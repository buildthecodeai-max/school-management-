import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { PlatformNav } from "../PlatformNav";
import { PlanForm } from "./PlanForm";
import { NewPlanForm } from "./NewPlanForm";

export const metadata = { title: "Plans" };

export default async function PlansPage() {
  const ctx = await requireUser();
  if (!ctx.isPlatformStaff) redirect("/portal");
  if (!can(ctx, "platform.manage")) redirect("/portal/platform");

  const plans = await prisma.plan.findMany({
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { priceMonthly: "asc" },
  });

  const mrr = plans.reduce(
    (sum, p) => sum + p.priceMonthly * p._count.subscriptions,
    0,
  );
  const subscribed = plans.reduce((n, p) => n + p._count.subscriptions, 0);

  return (
    <div>
      <PageHeader
        title="Subscription plans"
        subtitle="Pricing tiers and their limits. Changes apply to all subscribers on that plan."
      />
      <PlatformNav />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Plans" value={plans.length} />
        <StatCard label="Subscriptions" value={subscribed} tone="sky" />
        <StatCard
          label="Monthly recurring"
          value={`$${(mrr / 100).toLocaleString()}`}
          tone="green"
        />
      </div>

      <NewPlanForm />

      <div className="space-y-4">
        {plans.map((p) => (
          <PlanForm
            key={p.id}
            plan={{
              id: p.id,
              code: p.code,
              name: p.name,
              priceMonthly: p.priceMonthly,
              currency: p.currency,
              maxStudents: p.maxStudents,
              maxCampuses: p.maxCampuses,
              isActive: p.isActive,
              subscriberCount: p._count.subscriptions,
            }}
          />
        ))}
      </div>
    </div>
  );
}
