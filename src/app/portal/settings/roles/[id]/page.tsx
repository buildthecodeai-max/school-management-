import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { isStandardRoleName, ALL_SCHOOL_PERMISSIONS } from "@/lib/access";
import { ungrantableAt } from "@/lib/access-server";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { PermissionPicker } from "../../PermissionPicker";
import { updateRole, deleteRole, duplicateRole } from "../actions";

export const metadata = { title: "Edit role" };

export default async function RoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireUser();
  if (!ctx.tenantId || !can(ctx, "iam.roles.manage")) redirect("/portal?denied=iam.roles.manage");
  const { id } = await params;
  const role = await prisma.role.findFirst({ where: { id, tenantId: ctx.tenantId }, include: { assignments: { include: { user: { select: { id: true, displayName: true, email: true } }, campus: { select: { name: true } } }, take: 50 } } });
  if (!role) notFound();
  const builtIn = isStandardRoleName(role.name);
  const cannotManage = ungrantableAt(ctx, role.permissions, null).length > 0;
  const locked = ungrantableAt(ctx, ALL_SCHOOL_PERMISSIONS, null);
  const readOnly = builtIn || cannotManage;

  return (
    <div className="max-w-4xl space-y-6">
      <div><Link href="/portal/settings/roles" className="text-sm text-brand-700 hover:underline">← Roles</Link></div>
      <PageHeader title={role.name} subtitle={`${role.permissions.length} permissions · ${role.assignments.length} assignment(s)`} action={builtIn ? <Badge tone="slate">built-in</Badge> : undefined} />
      {readOnly && (
        <Card>
          <p className="text-sm">{builtIn ? "Built-in roles cannot be edited, so every school starts from the same known set." : "This role includes permissions you do not hold yourself, so you cannot change it."} You can copy it and change the copy.</p>
          <ActionForm action={duplicateRole} submit="Duplicate this role" className="mt-3"><input type="hidden" name="roleId" value={role.id} /></ActionForm>
        </Card>
      )}
      <Card>
        {readOnly ? <PermissionPicker selected={role.permissions} readOnly /> : (
          <ActionForm action={updateRole} submit="Save changes" pendingLabel="Saving…" className="space-y-4">
            <input type="hidden" name="roleId" value={role.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className={labelCls}>Name</span><input name="name" defaultValue={role.name} required minLength={2} maxLength={60} className={inputCls} /></label>
              <label><span className={labelCls}>Description</span><input name="description" defaultValue={role.description ?? ""} maxLength={200} className={inputCls} /></label>
            </div>
            <PermissionPicker selected={role.permissions} locked={locked.filter((p) => !role.permissions.includes(p))} />
          </ActionForm>
        )}
      </Card>
      <Card>
        <h3 className="mb-2 font-semibold">Who has it</h3>
        {role.assignments.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">Nobody yet.</p> : (
          <ul className="text-sm">{role.assignments.map((a) => <li key={a.id} className="py-0.5"><Link className="text-brand-700 hover:underline" href={`/portal/settings/users/${a.user.id}`}>{a.user.displayName}</Link> <span className="text-xs text-[color:var(--color-muted)]">{a.scopeType === "ORG" ? "all campuses" : a.campus?.name}</span></li>)}</ul>
        )}
        {!builtIn && role.assignments.length === 0 && (
          <ActionForm action={deleteRole} submit="Delete role" variant="danger" confirmText={`Delete the role "${role.name}"?`} className="mt-4"><input type="hidden" name="roleId" value={role.id} /></ActionForm>
        )}
      </Card>
    </div>
  );
}
