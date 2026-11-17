import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, StatCard, ButtonLink } from "@/components/ui";
import { PlatformNav } from "./PlatformNav";
import { TenantRowActions } from "./TenantRowActions";
import { CategoryIcon } from "./audit/CategoryIcon";
import { describeAuditAction, relativeTime } from "@/lib/audit-format";
import { getTenantUsage } from "@/lib/entitlements";

export default async function PlatformPage() {
  const ctx = await requireUser();
  if (!ctx.isPlatformStaff) redirect("/portal");
  const canManage = can(ctx, "platform.manage");

  const [tenants, recentAudit, auditTotal] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { campuses: true, users: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.auditEvent.count(),
  ]);

  const recentActorIds = [...new Set(recentAudit.map((a) => a.actorUserId).filter(Boolean))] as string[];
  const recentActors = await prisma.user.findMany({
    where: { id: { in: recentActorIds } },
    select: { id: true, displayName: true },
  });
  const recentActorById = new Map(recentActors.map((a) => [a.id, a.displayName]));

  const usageByTenant = new Map(
    await Promise.all(
      tenants.map(async (t) => [t.id, await getTenantUsage(t.id)] as const),
    ),
  );

  const overLimitCount = [...usageByTenant.values()].filter((u) => u?.overLimit).length;
  const mrr = tenants.reduce(
    (sum, t) =>
      sum + (t.status === "ACTIVE" ? (t.subscription?.plan.priceMonthly ?? 0) : 0),
    0,
  );
  const totalStudents = [...usageByTenant.values()].reduce(
    (n, u) => n + (u?.students ?? 0),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Platform administration"
        subtitle="Tenant registry, subscriptions and recent audit activity."
        action={
          can(ctx, "platform.tenant.provision") ? (
            <ButtonLink href="/portal/platform/tenants/new">+ Add school</ButtonLink>
          ) : undefined
        }
      />
      <PlatformNav />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Tenants" value={tenants.length} />
        <StatCard
          label="Active"
          value={tenants.filter((t) => t.status === "ACTIVE").length}
          tone="green"
        />
        <StatCard
          label="Trials"
          value={tenants.filter((t) => t.status === "TRIAL").length}
          tone="sky"
        />
        <StatCard
          label="Students"
          value={totalStudents.toLocaleString()}
          tone="sky"
        />
        <StatCard
          label="MRR"
          value={`$${(mrr / 100).toLocaleString()}`}
          tone="green"
        />
        <StatCard
          label="Over plan limit"
          value={overLimitCount}
          tone={overLimitCount > 0 ? "amber" : "slate"}
        />
      </div>

      <Card className="mb-6 p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="px-5 py-3 font-medium">Organization</th>
                <th className="px-5 py-3 font-medium">Slug</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Campuses</th>
                <th className="px-5 py-3 font-medium">Students</th>
                <th className="px-5 py-3 font-medium">Users</th>
                {canManage && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const usage = usageByTenant.get(t.id);
                return (
                <tr
                  key={t.id}
                  className="border-b border-[color:var(--color-line)] last:border-0"
                >
                  <td className="px-5 py-3 font-medium">
                    <Link href={`/portal/platform/tenants/${t.id}`} className="text-brand-700 hover:underline">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[color:var(--color-muted)]">
                    {t.slug}
                  </td>
                  <td className="px-5 py-3">{t.subscription?.plan.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    <Badge
                      tone={
                        t.status === "ACTIVE"
                          ? "green"
                          : t.status === "TRIAL"
                            ? "sky"
                            : "amber"
                      }
                    >
                      {t.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {usage ? (
                      <span className={usage.campusesOverBy > 0 ? "font-medium text-red-600" : ""}>
                        {usage.campuses}
                        <span className="text-[color:var(--color-muted)]">/{usage.maxCampuses}</span>
                      </span>
                    ) : (
                      t._count.campuses
                    )}
                  </td>
                  <td className="px-5 py-3 tabular-nums">
                    {usage ? (
                      <span className={usage.studentsOverBy > 0 ? "font-medium text-red-600" : ""}>
                        {usage.students}
                        <span className="text-[color:var(--color-muted)]">/{usage.maxStudents}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-3 tabular-nums">{t._count.users}</td>
                  {canManage && (
                    <td className="px-5 py-3">
                      <TenantRowActions tenantId={t.id} status={t.status} />
                    </td>
                  )}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-semibold">Recent audit trail</h3>
          <Link href="/portal/platform/audit" className="text-sm text-brand-700 hover:underline">
            View all {auditTotal.toLocaleString()} →
          </Link>
        </div>
        <ul className="divide-y divide-[color:var(--color-line)]">
          {recentAudit.map((a) => {
            const { text, category } = describeAuditAction(a.action);
            const actorName = a.actorUserId ? recentActorById.get(a.actorUserId) : null;
            const flagged = a.outcome !== "SUCCESS";
            return (
            <li
              key={a.id}
              className={`flex items-center gap-3 py-2 text-sm ${flagged ? "bg-red-50/40" : ""}`}
            >
              <CategoryIcon category={category} />
              <div className="min-w-0 flex-1">
                <p className="truncate">
                  <span className="font-medium">{actorName ?? "System"}</span>{" "}
                  <span className="text-[color:var(--color-muted)]">{text}</span>
                </p>
                {flagged && (
                  <Badge tone={a.outcome === "DENIED" ? "amber" : "red"}>{a.outcome}</Badge>
                )}
              </div>
              <span
                title={a.createdAt.toLocaleString()}
                className="whitespace-nowrap text-xs text-[color:var(--color-muted)]"
              >
                {relativeTime(a.createdAt)}
              </span>
            </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
