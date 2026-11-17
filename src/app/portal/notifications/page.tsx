import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, StatCard, EmptyState } from "@/components/ui";
import { retryDeliveryAction } from "./actions";
import type { DeliveryStatus } from "@prisma/client";

const STATUS_TONE: Record<DeliveryStatus, "green" | "red" | "slate"> = {
  SENT: "green",
  FAILED: "red",
  SKIPPED: "slate",
};

export default async function NotificationsOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requirePermission("notifications.operate");
  const { status } = await searchParams;
  const statusFilter = status as DeliveryStatus | undefined;

  const [deliveries, counts] = await Promise.all([
    prisma.deliveryAttempt.findMany({
      where: {
        tenantId: ctx.tenantId!,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: { message: { include: { recipient: true } } },
      orderBy: { attemptedAt: "desc" },
      take: 150,
    }),
    prisma.deliveryAttempt.groupBy({
      by: ["status"],
      where: { tenantId: ctx.tenantId! },
      _count: true,
    }),
  ]);

  const countOf = (s: DeliveryStatus) =>
    counts.find((c) => c.status === s)?._count ?? 0;

  const filters: (DeliveryStatus | "ALL")[] = ["ALL", "SENT", "FAILED", "SKIPPED"];

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/messages" className="text-sm text-brand-700 hover:underline">
          ← Messages
        </Link>
      </div>
      <PageHeader
        title="Notification delivery log"
        subtitle="Every external delivery attempt with provider, status, correlation id and failure reason (NTF-003)."
        action={
          <Link href="/portal/notifications/templates" className="rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
            Message templates →
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-4">
        <StatCard label="Sent" value={countOf("SENT")} tone="green" />
        <StatCard label="Failed" value={countOf("FAILED")} tone="red" />
        <StatCard label="Skipped" value={countOf("SKIPPED")} tone="slate" />
      </div>

      <div className="mb-4 flex gap-2">
        {filters.map((f) => {
          const active = (f === "ALL" && !status) || f === status;
          const href = f === "ALL" ? "/portal/notifications" : `/portal/notifications?status=${f}`;
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

      {deliveries.length === 0 ? (
        <EmptyState title="No delivery attempts" />
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                  <th className="px-5 py-3 font-medium">Recipient</th>
                  <th className="px-5 py-3 font-medium">Message</th>
                  <th className="px-5 py-3 font-medium">Channel</th>
                  <th className="px-5 py-3 font-medium">Provider</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 font-medium">Correlation</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-[color:var(--color-line)] last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-medium">{d.message.recipient.displayName}</p>
                      <p className="text-xs text-[color:var(--color-muted)]">{d.recipient ?? "—"}</p>
                    </td>
                    <td className="px-5 py-3 text-[color:var(--color-muted)]">{d.message.title}</td>
                    <td className="px-5 py-3">{d.channel}</td>
                    <td className="px-5 py-3 text-[color:var(--color-muted)]">{d.provider}</td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge>
                      {d.error && (
                        <p className="mt-0.5 max-w-xs text-xs text-[color:var(--color-muted)]">{d.error}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-[color:var(--color-muted)]">
                      {d.attemptedAt.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[color:var(--color-muted)]">
                      {d.correlationId.slice(0, 8)}
                    </td>
                    <td className="px-5 py-3">
                      {d.status === "FAILED" && (
                        <form action={retryDeliveryAction}>
                          <input type="hidden" name="deliveryId" value={d.id} />
                          <button className="text-brand-700 hover:underline">Retry</button>
                        </form>
                      )}
                    </td>
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
