import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { startImpersonationAction, ensureSchoolRoles } from "../../actions";
import { EditTenantForm, DeleteTenantPanel } from "./TenantAdmin";
import { SubscriptionPanel, UserRowActions } from "./SubscriptionPanel";
import { PlatformCampusForm } from "./PlatformCampusForm";
import { ManageBar } from "./ManageBar";
import { CampusManageRow } from "./CampusManageRow";
import { AddUserForm, RoleChips, AssignRoleForm, EditUserForm } from "./UserManage";
import { getTenantUsage, ENROLLED_STATUSES } from "@/lib/entitlements";
import { enterOrganization } from "../../context-actions";

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireUser();
  if (!ctx.isPlatformStaff) redirect("/portal");
  const { id } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { campuses: true, users: true } },
    },
  });
  if (!tenant) notFound();

  const users = await prisma.user.findMany({
    where: { tenantId: id },
    include: { roleAssignments: { include: { role: true } } },
    orderBy: { createdAt: "asc" },
  });

  const canImpersonate = can(ctx, "platform.impersonate");
  const canManage = can(ctx, "platform.manage");
  const counts = tenant._count;

  const usage = await getTenantUsage(id);

  const campuses = await prisma.campus.findMany({
    where: { tenantId: id },
    include: {
      _count: { select: { enrollments: { where: { status: { in: [...ENROLLED_STATUSES] } } }, sections: true } },
    },
    orderBy: { name: "asc" },
  });

  const plans = canManage
    ? await prisma.plan.findMany({
        select: { id: true, name: true },
        orderBy: { priceMonthly: "asc" },
      })
    : [];

  // Roles scoped to THIS tenant only — never the platform's null-tenantId
  // system role, which must not be assignable to a school user.
  const roles = canManage
    ? await prisma.role.findMany({
        where: { tenantId: id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];
  const campusOptions = campuses.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/platform" className="text-sm text-brand-700 hover:underline">
          ← Platform
        </Link>
      </div>
      <PageHeader
        title={tenant.name}
        subtitle={`${tenant.slug} · ${tenant.subscription?.plan.name ?? "no plan"}`}
        action={<Badge tone={tenant.status === "ACTIVE" ? "green" : "amber"}>{tenant.status}</Badge>}
      />

      {canManage && <ManageBar tenantId={tenant.id} status={tenant.status} />}
      {canManage && (
        <form action={enterOrganization} className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <input type="hidden" name="tenantId" value={tenant.id} />
          <label htmlFor="operator-campus">Open school workspace</label>
          <select id="operator-campus" name="campusId" className="rounded border p-2">
            <option value="">All campuses</option>
            {campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="rounded bg-brand-600 px-4 py-2 text-white">Open dashboard</button>
        </form>
      )}

      <Card className="mb-6 p-0">
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="font-semibold">Campuses</h3>
        </div>
        {canManage && (
          <PlatformCampusForm tenantId={tenant.id} defaultTimezone={tenant.timezone} />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="px-5 py-3 font-medium">Campus</th>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">City</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Students</th>
                <th className="px-5 py-3 font-medium">Sections</th>
                {canManage && <th className="px-5 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {campuses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-[color:var(--color-muted)]">
                    No campuses yet.{canManage ? " Use “Add campus” above to create one." : " An org owner creates these from Campuses inside the tenant."}
                  </td>
                </tr>
              ) : canManage ? (
                campuses.map((c) => (
                  <CampusManageRow
                    key={c.id}
                    c={{
                      id: c.id,
                      name: c.name,
                      code: c.code,
                      city: c.city,
                      timezone: c.timezone,
                      status: c.status,
                      enrollments: c._count.enrollments,
                      sections: c._count.sections,
                    }}
                  />
                ))
              ) : (
                campuses.map((c) => (
                  <tr key={c.id} className="border-b border-[color:var(--color-line)] last:border-0">
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-5 py-3 text-[color:var(--color-muted)]">{c.city ?? "—"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={c.status === "ACTIVE" ? "green" : c.status === "CLOSED" ? "slate" : "amber"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3">{c._count.enrollments}</td>
                    <td className="px-5 py-3">{c._count.sections}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0">
        <h3 className="px-5 pt-4 font-semibold">Users</h3>
        {canManage && <form action={ensureSchoolRoles} className="px-5 py-3"><input type="hidden" name="tenantId" value={tenant.id} /><button className="rounded border px-3 py-2 text-sm">Add missing standard school roles</button><p className="mt-1 text-xs">Owner, campus administrator, admissions, finance, teacher and parent / guardian. Existing roles are preserved.</p></form>}
        {canManage && (
          <AddUserForm tenantId={tenant.id} roles={roles} campuses={campusOptions} />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Roles</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[color:var(--color-line)] last:border-0">
                  <td className="px-5 py-3 font-medium">{u.displayName}{canManage && !u.isPlatformStaff && <EditUserForm userId={u.id} displayName={u.displayName} email={u.email} />}</td>
                  <td className="px-5 py-3 text-[color:var(--color-muted)]">{u.email}</td>
                  <td className="px-5 py-3">
                    {u.isPlatformStaff ? (
                      <span className="text-xs text-[color:var(--color-muted)]">platform staff</span>
                    ) : canManage ? (
                      <div>
                        <RoleChips
                          assignments={u.roleAssignments.map((a) => ({
                            id: a.id,
                            roleName: a.role.name,
                            scopeType: a.scopeType,
                            campusName: campusOptions.find((c) => c.id === a.campusId)?.name ?? null,
                          }))}
                        />
                        <AssignRoleForm userId={u.id} roles={roles} campuses={campusOptions} />
                      </div>
                    ) : (
                      [...new Set(u.roleAssignments.map((a) => a.role.name))].join(", ") || "—"
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={u.status === "ACTIVE" ? "green" : "slate"}>{u.status}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {canImpersonate && u.status === "ACTIVE" && (
                        <form action={startImpersonationAction}>
                          <input type="hidden" name="targetUserId" value={u.id} />
                          <button className="text-sm text-brand-700 hover:underline">
                            Impersonate
                          </button>
                        </form>
                      )}
                      {canManage && !u.isPlatformStaff && (
                        <UserRowActions userId={u.id} status={u.status} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-[color:var(--color-muted)]">
        Impersonation starts and ends are recorded in the audit trail with your
        own user id as the actor. Your own session is preserved — use
        &quot;End impersonation&quot; in the banner to return to it.
      </p>

      {canManage && (
        <div className="mt-8 space-y-6">
          <div id="edit-school" className="scroll-mt-6">
            <EditTenantForm
              tenantId={tenant.id}
              name={tenant.name}
              status={tenant.status}
              planId={tenant.subscription?.planId ?? null}
              plans={plans}
            />
          </div>
          {tenant.subscription && (
            <SubscriptionPanel
              tenantId={tenant.id}
              status={tenant.subscription.status}
              trialEndsAt={tenant.subscription.trialEndsAt}
              currentPeriodEnd={tenant.subscription.currentPeriodEnd}
              usage={usage}
            />
          )}
          <div id="danger-zone" className="scroll-mt-6">
            <DeleteTenantPanel
              tenantId={tenant.id}
              slug={tenant.slug}
              status={tenant.status}
              campusCount={counts.campuses}
              userCount={counts.users}
            />
          </div>
        </div>
      )}
    </div>
  );
}
