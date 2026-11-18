import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { PageHeader, Card } from "@/components/ui";

export default async function AccountPage() {
  const ctx = await requireUser();
  const { user } = ctx;

  const roleNames = [
    ...new Set(user.roleAssignments.map((a) => a.role.name)),
  ].join(", ") || "—";

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="My account" subtitle={user.email} />

      <Card className="mb-4 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-semibold text-brand-700">
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold">{user.displayName}</p>
            <p className="text-sm text-[color:var(--color-muted)]">{user.email}</p>
            <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">{roleNames}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <Link
          href="/portal/account/password"
          className="flex items-center justify-between rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-4 text-sm font-medium hover:bg-brand-50"
        >
          <span>Change password</span>
          <span className="text-[color:var(--color-muted)]">→</span>
        </Link>
        <Link
          href="/portal/settings/security"
          className="flex items-center justify-between rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-4 text-sm font-medium hover:bg-brand-50"
        >
          <span>Two-factor authentication</span>
          <span className="text-sm text-[color:var(--color-muted)]">
            {user.mfaEnabled ? "Enabled →" : "Not enabled →"}
          </span>
        </Link>
        {ctx.tenantId && (
          <Link
            href="/portal/preferences"
            className="flex items-center justify-between rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-4 text-sm font-medium hover:bg-brand-50"
          >
            <span>Notification preferences</span>
            <span className="text-[color:var(--color-muted)]">→</span>
          </Link>
        )}
        {ctx.tenantId && (
          <Link
            href="/portal/messages"
            className="flex items-center justify-between rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-4 text-sm font-medium hover:bg-brand-50"
          >
            <span>Message inbox</span>
            <span className="text-[color:var(--color-muted)]">→</span>
          </Link>
        )}
      </div>
    </div>
  );
}
