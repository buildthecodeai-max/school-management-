import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { formatMoney } from "@/lib/money";

// TEN-005: the landing page for a suspended tenant. Data is never deleted or
// hidden here — only interactive use (recorded via the rbac.ts choke point)
// is blocked. Billing stays reachable so the organization can reactivate.
export default async function SuspendedPage() {
  const ctx = await requireUser();
  if (!ctx.isSuspended) redirect("/portal");

  const sub = ctx.tenantId
    ? await prisma.subscription.findUnique({
        where: { tenantId: ctx.tenantId },
        include: { plan: true },
      })
    : null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Subscription suspended"
        action={<Badge tone="red">Suspended</Badge>}
      />
      <Card>
        <p className="text-sm text-[color:var(--color-muted)]">
          {ctx.user.tenant?.name ?? "This organization"}&apos;s subscription is
          currently suspended. No data has been deleted — records, students,
          and history remain exactly as they were. Most portal actions are
          unavailable until the subscription is reactivated.
        </p>
        {sub && (
          <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
            <p>
              Plan: <span className="font-medium">{sub.plan.name}</span> ·{" "}
              {formatMoney(sub.plan.priceMonthly)}/month
            </p>
            <p className="mt-1 text-[color:var(--color-muted)]">
              Contact your account owner or platform support to resolve
              outstanding billing and restore access.
            </p>
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <Link
            href="/portal/billing"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            View subscription
          </Link>
          <Link
            href="/portal/messages"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
          >
            Messages
          </Link>
        </div>
      </Card>
    </div>
  );
}
