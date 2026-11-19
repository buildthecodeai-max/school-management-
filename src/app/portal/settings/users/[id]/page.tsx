import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, canAnywhere, canForCampus, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PERMISSIONS, PERMISSION_GROUPS } from "@/lib/permissions";
import { effectiveAccess, isPlatformPermission } from "@/lib/access";
import { assignmentsOf, canManageUser, holdsAt } from "@/lib/access-server";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { LinkForm } from "@/components/LinkForm";
import { grantRole, revokeRole, setUserActive, issueInvite } from "../actions";

export const metadata = { title: "User access" };

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (!ctx.tenantId || !canAnywhere(ctx, "iam.users.manage")) redirect("/portal?denied=iam.users.manage");
  const { id } = await params;
  const user = await prisma.user.findFirst({
    where: { id, tenantId: ctx.tenantId, isPlatformStaff: false },
    include: { roleAssignments: { include: { role: true, campus: { select: { id: true, name: true } } } } },
  });
  if (!user) notFound();
  const manage = canManageUser(ctx, user);
  if (!manage.ok) notFound();
  const self = user.id === ctx.user.id;

  const [roles, campuses] = await Promise.all([
    prisma.role.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
    prisma.campus.findMany({ where: { tenantId: ctx.tenantId, status: { not: "CLOSED" } }, orderBy: { name: "asc" } }),
  ]);
  const campusName = new Map(campuses.map((c) => [c.id, c.name]));
  const access = effectiveAccess(assignmentsOf(user));
  const roleOptions = roles.filter((r) => r.permissions.every((p) => holdsAt(ctx, p, null)));
  const campusRoleOptions = roles; // checked on the server per campus
  const campusOptions = campuses.filter((c) => canForCampus(ctx, "iam.users.manage", c.id));
  const campusIds = [...access.byCampus.keys()];

  return (
    <div className="max-w-4xl space-y-6">
      <div><Link href="/portal/settings/users" className="text-sm text-brand-700 hover:underline">← Users & roles</Link></div>
      <PageHeader title={user.displayName} subtitle={user.email} action={<Badge tone={user.status === "DISABLED" ? "red" : "green"}>{user.status}</Badge>} />

      <Card>
        <h3 className="mb-3 font-semibold">Roles</h3>
        {user.roleAssignments.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No roles. They can sign in but see almost nothing.</p> : (
          <ul className="divide-y divide-[color:var(--color-line)] text-sm">
            {user.roleAssignments.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2">
                <span><b>{a.role.name}</b> <span className="text-[color:var(--color-muted)]">· {a.scopeType === "ORG" ? "all campuses" : a.campus?.name ?? "one campus"} · {a.role.permissions.includes("*") ? "all permissions" : `${a.role.permissions.length} permissions`}</span></span>
                {!self && <ActionForm action={revokeRole} submit="Remove" variant="ghost" confirmText={`Remove ${a.role.name} from ${user.displayName}?`}><input type="hidden" name="assignmentId" value={a.id} /></ActionForm>}
              </li>
            ))}
          </ul>
        )}
        {self ? <p className="mt-3 text-xs text-[color:var(--color-muted)]">You cannot change your own access.</p> : (
          <ActionForm action={grantRole} submit="Give role" pendingLabel="Giving…" className="mt-4 grid gap-3 border-t border-[color:var(--color-line)] pt-4 sm:grid-cols-4">
            <input type="hidden" name="userId" value={user.id} />
            <label><span className={labelCls}>Role</span><select name="roleId" required className={inputCls}><option value="">Choose…</option>{(can(ctx, "iam.users.manage") ? roleOptions : campusRoleOptions).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <label><span className={labelCls}>Where</span><select name="scopeType" className={inputCls}>{can(ctx, "iam.users.manage") && <option value="ORG">All campuses</option>}<option value="CAMPUS">One campus…</option></select></label>
            <label><span className={labelCls}>Campus</span><select name="campusId" className={inputCls}><option value="">—</option>{campusOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </ActionForm>
        )}
      </Card>

      <Card>
        <h3 className="mb-1 font-semibold">What they can do</h3>
        <p className="mb-3 text-xs text-[color:var(--color-muted)]">Worked out from the roles above. “All” means on every campus; otherwise the campuses are listed.</p>
        <div className="space-y-3">
          {PERMISSION_GROUPS.map((g) => {
            const rows = g.keys.filter((k) => !isPlatformPermission(k)).map((k) => ({ k, all: access.org.has(k), on: campusIds.filter((c) => access.byCampus.get(c)?.has(k)) })).filter((r) => r.all || r.on.length > 0);
            if (rows.length === 0) return null;
            return (
              <div key={g.label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">{g.label}</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {rows.map((r) => <li key={r.k} className="flex justify-between gap-3"><span>{PERMISSIONS[r.k]}</span><span className="shrink-0 text-xs text-[color:var(--color-muted)]">{r.all ? "All" : r.on.map((c) => campusName.get(c) ?? "campus").join(", ")}</span></li>)}
                </ul>
              </div>
            );
          })}
          {access.org.size === 0 && access.byCampus.size === 0 && <p className="text-sm text-[color:var(--color-muted)]">Nothing.</p>}
        </div>
      </Card>

      {!self && (
        <Card>
          <h3 className="mb-3 font-semibold">Account</h3>
          <div className="flex flex-wrap items-start gap-6">
            {user.status !== "DISABLED" && (
              <LinkForm action={issueInvite} submit="New sign-in link" variant="ghost" className="max-w-md">
                <input type="hidden" name="userId" value={user.id} />
                <p className="mb-2 text-xs text-[color:var(--color-muted)]">Creates a one-time link so they can choose a new password. Any earlier link stops working.</p>
              </LinkForm>
            )}
            {user.status === "DISABLED" ? (
              <ActionForm action={setUserActive} submit="Enable account"><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="to" value="ACTIVE" /></ActionForm>
            ) : (
              <ActionForm action={setUserActive} submit="Disable account" variant="danger" confirmText={`Disable ${user.displayName}? They are signed out right away.`}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="to" value="DISABLED" /></ActionForm>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
