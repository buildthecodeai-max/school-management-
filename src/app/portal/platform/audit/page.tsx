import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { PlatformNav } from "../PlatformNav";
import { CategoryIcon } from "./CategoryIcon";
import { describeAuditAction, relativeTime, dayLabel, dayKey } from "@/lib/audit-format";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

// Best-effort extraction of a display-worthy detail from an event's free-form
// metadata, tried in the order most actions are likely to populate it. Not
// every action has one of these fields — that's fine, the line just omits it.
function extractDetail(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  const to = m.to as Record<string, unknown> | undefined;
  const candidates = [to?.name, m.name, m.displayName, m.email, m.role];
  const found = candidates.find((v) => typeof v === "string" && v.length > 0);
  return (found as string) ?? null;
}

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string; outcome?: string; q?: string; page?: string }>;
}) {
  const ctx = await requireUser();
  if (!ctx.isPlatformStaff) redirect("/portal");

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const tenantFilter = sp.tenant || "";
  const outcomeFilter = sp.outcome || "";
  const query = (sp.q || "").trim();

  const where = {
    ...(tenantFilter ? { tenantId: tenantFilter } : {}),
    ...(outcomeFilter ? { outcome: outcomeFilter } : {}),
    ...(query ? { action: { contains: query, mode: "insensitive" as const } } : {}),
  };

  const [events, total, tenants] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditEvent.count({ where }),
    prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const actorIds = [...new Set(events.map((e) => e.actorUserId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, displayName: true, email: true },
  });
  const actorById = new Map(actors.map((a) => [a.id, a]));
  const tenantById = new Map(tenants.map((t) => [t.id, t.name]));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (overrides: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (tenantFilter) p.set("tenant", tenantFilter);
    if (outcomeFilter) p.set("outcome", outcomeFilter);
    if (query) p.set("q", query);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === "") p.delete(k);
      else p.set(k, String(v));
    }
    return `?${p.toString()}`;
  };

  // Bucket into day groups, in the order they already arrive (newest first).
  const now = new Date();
  const groups: { key: string; label: string; events: typeof events }[] = [];
  for (const e of events) {
    const key = dayKey(e.createdAt);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(e.createdAt, now), events: [] };
      groups.push(group);
    }
    group.events.push(e);
  }

  const selectCls =
    "rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

  return (
    <div>
      <PageHeader
        title="Audit log"
        subtitle={`${total.toLocaleString()} event${total === 1 ? "" : "s"} across all tenants.`}
      />
      <PlatformNav />

      <form
        method="get"
        className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface2)] p-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]" htmlFor="f-tenant">
            Tenant
          </label>
          <select id="f-tenant" name="tenant" defaultValue={tenantFilter} className={selectCls}>
            <option value="">All tenants</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]" htmlFor="f-outcome">
            Outcome
          </label>
          <select id="f-outcome" name="outcome" defaultValue={outcomeFilter} className={selectCls}>
            <option value="">Any</option>
            <option value="SUCCESS">Success</option>
            <option value="DENIED">Denied</option>
            <option value="FAILURE">Failure</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]" htmlFor="f-q">
            Action contains
          </label>
          <input id="f-q" name="q" defaultValue={query} placeholder="fee.payment" className={selectCls} />
        </div>
        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Filter
        </button>
        {(tenantFilter || outcomeFilter || query) && (
          <Link href="/portal/platform/audit" className="text-sm text-brand-700 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <Card className="p-0">
        {events.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[color:var(--color-muted)]">
            No audit events match these filters.
          </p>
        ) : (
          <ul>
            {groups.map((group) => (
              <li key={group.key}>
                <div className="sticky top-0 z-10 border-b border-[color:var(--color-line)] bg-white/95 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)] backdrop-blur">
                  {group.label}
                </div>
                <ul>
                  {group.events.map((e) => {
                    const actor = e.actorUserId ? actorById.get(e.actorUserId) : null;
                    const { text, category } = describeAuditAction(e.action);
                    const tenantName = e.tenantId ? tenantById.get(e.tenantId) : null;
                    const detail = extractDetail(e.metadata);
                    const flagged = e.outcome !== "SUCCESS";

                    return (
                      <li
                        key={e.id}
                        className={`flex items-start gap-3 border-b border-[color:var(--color-line)] px-5 py-3 last:border-0 hover:bg-slate-50 ${
                          flagged ? "border-l-2 border-l-red-400 bg-red-50/40" : ""
                        }`}
                      >
                        <CategoryIcon category={category} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug">
                            <span className="font-medium">
                              {actor ? actor.displayName : "System"}
                            </span>{" "}
                            <span className="text-[color:var(--color-muted)]">{text}</span>
                            {detail && (
                              <>
                                {" "}
                                <span className="font-medium">&ldquo;{detail}&rdquo;</span>
                              </>
                            )}
                            {tenantName && (
                              <span className="text-[color:var(--color-muted)]"> · {tenantName}</span>
                            )}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <span className="font-mono text-[10px] text-slate-400">{e.action}</span>
                            {flagged && (
                              <Badge tone={e.outcome === "DENIED" ? "amber" : "red"}>
                                {e.outcome}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <time
                          dateTime={e.createdAt.toISOString()}
                          title={e.createdAt.toLocaleString()}
                          className="whitespace-nowrap text-xs text-[color:var(--color-muted)]"
                        >
                          {relativeTime(e.createdAt, now)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-[color:var(--color-muted)]">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={qs({ page: page - 1 })}
                className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 hover:bg-[color:var(--color-surface2)]"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={qs({ page: page + 1 })}
                className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 hover:bg-[color:var(--color-surface2)]"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
