import Link from "next/link";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import { ApiClientForm } from "./ApiClientForm";
import {
  revokeApiClient,
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  redeliverWebhookAction,
} from "./actions";

export default async function IntegrationsPage() {
  const ctx = await requireUser();
  if (!ctx.tenantId || !can(ctx, "integrations.manage")) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Integrations" />
        <Card>
          <p className="text-sm text-[color:var(--color-muted)]">
            Managing API clients and webhooks requires organization-wide
            rights. Ask an organization owner.
          </p>
        </Card>
      </div>
    );
  }

  const [clients, endpoints] = await Promise.all([
    prisma.apiClient.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.webhookEndpoint.findMany({
      where: { tenantId: ctx.tenantId },
      include: { deliveries: { orderBy: { deliveredAt: "desc" }, take: 5 } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <PageHeader
          title="Integrations"
          subtitle="Public API credentials and outbound webhooks (API §15)."
          action={
            <a
              href="/api/v1/openapi.json"
              target="_blank"
              className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
            >
              OpenAPI spec
            </a>
          }
        />
      </div>

      {/* API clients */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">API clients</h2>
        <Card className="mb-4">
          <ApiClientForm />
        </Card>

        {clients.length === 0 ? (
          <EmptyState title="No API clients yet" />
        ) : (
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Key id</th>
                    <th className="px-5 py-3 font-medium">Scopes</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Last used</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="border-b border-[color:var(--color-line)] last:border-0">
                      <td className="px-5 py-3 font-medium">{c.name}</td>
                      <td className="px-5 py-3 font-mono text-xs">{c.keyId}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.scopes.map((s) => (
                            <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={c.status === "ACTIVE" ? "green" : "slate"}>{c.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-xs text-[color:var(--color-muted)]">
                        {c.lastUsedAt ? c.lastUsedAt.toLocaleString() : "never"}
                      </td>
                      <td className="px-5 py-3">
                        {c.status === "ACTIVE" && (
                          <form action={revokeApiClient}>
                            <input type="hidden" name="id" value={c.id} />
                            <button className="text-sm text-red-600 hover:underline">Revoke</button>
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
      </section>

      {/* Webhooks */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Webhook endpoints</h2>
        <Card className="mb-4">
          <form action={createWebhookEndpoint} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Endpoint URL</label>
              <input
                name="url"
                required
                placeholder="https://example.com/webhooks/scholarum"
                className="w-full max-w-md rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-[color:var(--color-muted)]">Events</p>
              <div className="flex flex-wrap gap-3">
                {WEBHOOK_EVENTS.map((e) => (
                  <label key={e} className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name={`event:${e}`} className="h-3.5 w-3.5" />
                    <code className="text-xs">{e}</code>
                  </label>
                ))}
              </div>
            </div>
            <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Add endpoint
            </button>
          </form>
        </Card>

        {endpoints.length === 0 ? (
          <EmptyState title="No webhook endpoints" />
        ) : (
          <div className="space-y-4">
            {endpoints.map((ep) => (
              <Card key={ep.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-sm">{ep.url}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ep.events.map((e) => (
                        <span key={e} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                          {e}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-[color:var(--color-muted)]">
                      Signing secret <code>{ep.secret}</code>
                    </p>
                  </div>
                  <form action={deleteWebhookEndpoint}>
                    <input type="hidden" name="id" value={ep.id} />
                    <button className="text-sm text-red-600 hover:underline">Delete</button>
                  </form>
                </div>

                {ep.deliveries.length > 0 && (
                  <div className="mt-3 border-t border-[color:var(--color-line)] pt-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">
                      Recent deliveries
                    </p>
                    <ul className="space-y-1.5 text-sm">
                      {ep.deliveries.map((d) => (
                        <li key={d.id} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <Badge tone={d.status === "DELIVERED" ? "green" : "red"}>{d.status}</Badge>
                            <code className="text-xs">{d.event}</code>
                            {d.httpStatus && (
                              <span className="text-xs text-[color:var(--color-muted)]">HTTP {d.httpStatus}</span>
                            )}
                            {d.error && <span className="text-xs text-red-600">{d.error}</span>}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-xs text-[color:var(--color-muted)]">
                              {d.deliveredAt.toLocaleTimeString()}
                            </span>
                            {d.status === "FAILED" && (
                              <form action={redeliverWebhookAction}>
                                <input type="hidden" name="deliveryId" value={d.id} />
                                <button className="text-xs text-brand-700 hover:underline">Redeliver</button>
                              </form>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-[color:var(--color-muted)]">
        See <Link href="/portal/setup" className="text-brand-700 hover:underline">Setup</Link>{" "}
        for the rest of onboarding.
      </p>
    </div>
  );
}
