import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, EmptyState, ButtonLink } from "@/components/ui";

export default async function MessagesPage() {
  const ctx = await requireUser();

  const messages = await prisma.message.findMany({
    where: { recipientUserId: ctx.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const canOperate =
    can(ctx, "notifications.operate") ||
    [...ctx.campusPermissions.values()].some((s) => s.has("notifications.operate") || s.has("*"));

  return (
    <div>
      <PageHeader
        title="Messages"
        subtitle="Your notices, alerts and school communications."
        action={
          <div className="flex gap-2">
            {ctx.tenantId && (
              <ButtonLink href="/portal/preferences" variant="ghost">
                Preferences
              </ButtonLink>
            )}
            {canOperate && (
              <ButtonLink href="/portal/notifications" variant="ghost">
                Delivery log
              </ButtonLink>
            )}
          </div>
        }
      />

      {messages.length === 0 ? (
        <EmptyState
          title="No messages"
          hint="Attendance alerts and school notices will appear here."
        />
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <Card key={m.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold">{m.title}</p>
                    {m.relatedType && (
                      <Badge
                        tone={
                          m.relatedType === "attendance"
                            ? "amber"
                            : m.relatedType === "finance"
                              ? "sky"
                              : "slate"
                        }
                      >
                        {m.relatedType}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--color-muted)]">
                    {m.body}
                  </p>
                </div>
                <span className="whitespace-nowrap text-xs text-[color:var(--color-muted)]">
                  {m.createdAt.toLocaleDateString()}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
