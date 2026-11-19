import Link from "next/link";
import { requireUser, canAnywhere, canForCampus, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { PageHeader, Card, Badge, ButtonLink } from "@/components/ui";
import { LinkForm } from "@/components/LinkForm";
import { inputCls, labelCls } from "@/components/ActionForm";
import { canManageUser, holdsAt } from "@/lib/access-server";
import { createSchoolUser } from "./actions";

export const metadata = { title: "Users & roles" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireUser();
  if (!ctx.tenantId || !canAnywhere(ctx, "iam.users.manage")) redirect("/portal?denied=iam.users.manage");
  const q = (await searchParams).q?.trim();

  const [users, roles, campuses] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId, isPlatformStaff: false, ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : {}) },
      include: { roleAssignments: { include: { role: true, campus: { select: { name: true } } } } },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      take: 300,
    }),
    prisma.role.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" } }),
    prisma.campus.findMany({ where: { tenantId: ctx.tenantId, status: { not: "CLOSED" } }, orderBy: { name: "asc" } }),
  ]);
  // Show the people this manager may actually manage.
  const manageable = users.filter((u) => canManageUser(ctx, u).ok);
  // A role can be offered only if the manager could give it somewhere (org-wide, or on a campus they manage).
  const grantable = (r: { permissions: string[] }, campusId: string | null) => holdsAt(ctx, "iam.users.manage", campusId) && r.permissions.every((p) => holdsAt(ctx, p, campusId));
  const orgRoles = roles.filter((r) => grantable(r, null));
  const campusOptions = campuses.filter((c) => canForCampus(ctx, "iam.users.manage", c.id));
  const status = (s: string) => (s === "DISABLED" ? "red" : s === "INVITED" ? "amber" : "green") as "red" | "amber" | "green";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & roles"
        subtitle="Who can sign in to this school, and what they may do"
        action={can(ctx, "iam.roles.manage") ? <ButtonLink href="/portal/settings/roles" variant="ghost">Manage roles →</ButtonLink> : undefined}
      />

      <Card>
        <h3 className="mb-3 font-semibold">Add a person</h3>
        <LinkForm action={createSchoolUser} submit="Add and create invite link" className="grid gap-3 sm:grid-cols-2">
          <label><span className={labelCls}>Full name</span><input name="displayName" required minLength={2} maxLength={120} className={inputCls} /></label>
          <label><span className={labelCls}>Email</span><input name="email" type="email" required className={inputCls} /></label>
          <label><span className={labelCls}>Role</span>
            <select name="roleId" required className={inputCls}><option value="">Choose…</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label><span className={labelCls}>Where</span>
            <select name="scopeType" className={inputCls}>{orgRoles.length > 0 && can(ctx, "iam.users.manage") && <option value="ORG">All campuses</option>}<option value="CAMPUS">One campus…</option></select></label>
          <label><span className={labelCls}>Campus (if one campus)</span>
            <select name="campusId" className={inputCls}><option value="">—</option>{campusOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label><span className={labelCls}>Profile</span>
            <select name="profile" defaultValue="STAFF" className={inputCls}><option value="STAFF">Staff member</option><option value="GUARDIAN">Parent / guardian</option><option value="NONE">Account only</option></select></label>
          <p className="text-xs text-[color:var(--color-muted)] sm:col-span-2">You can only give a role whose permissions you hold yourself. The person sets their own password through the link; nobody ever sees it.</p>
        </LinkForm>
      </Card>

      <Card className="overflow-x-auto">
        <form className="mb-3 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search name or email" className={`${inputCls} w-64`} />
          <button className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">Search</button>
        </form>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]"><th className="pb-2 pr-4">Name</th><th className="pb-2 pr-4">Roles</th><th className="pb-2 pr-4">Status</th><th className="pb-2 pr-4">Two-factor</th><th className="pb-2">Last sign-in</th></tr></thead>
          <tbody className="divide-y divide-[color:var(--color-line)]">
            {manageable.map((u) => (
              <tr key={u.id}>
                <td className="py-2 pr-4"><Link href={`/portal/settings/users/${u.id}`} className="font-medium text-brand-700 hover:underline">{u.displayName}</Link><span className="block text-xs text-[color:var(--color-muted)]">{u.email}</span></td>
                <td className="py-2 pr-4">{u.roleAssignments.map((a) => <span key={a.id} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.role.name}{a.scopeType === "CAMPUS" ? ` · ${a.campus?.name ?? "campus"}` : ""}</span>)}{u.roleAssignments.length === 0 && <span className="text-xs text-[color:var(--color-muted)]">no role</span>}</td>
                <td className="py-2 pr-4"><Badge tone={status(u.status)}>{u.status}</Badge></td>
                <td className="py-2 pr-4">{u.mfaSecret && !u.mfaSecret.startsWith("pending:") ? "On" : "Off"}</td>
                <td className="py-2 text-[color:var(--color-muted)]">{u.lastLoginAt ? u.lastLoginAt.toLocaleDateString() : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {manageable.length === 0 && <p className="py-3 text-sm text-[color:var(--color-muted)]">No people to show.</p>}
        {manageable.length < users.length && <p className="mt-3 text-xs text-[color:var(--color-muted)]">{users.length - manageable.length} other account(s) have access beyond what you manage and are not listed.</p>}
      </Card>
    </div>
  );
}
