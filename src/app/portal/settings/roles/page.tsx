import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { isStandardRoleName } from "@/lib/access";
import { ALL_SCHOOL_PERMISSIONS } from "@/lib/access";
import { ungrantableAt } from "@/lib/access-server";
import { PageHeader, Card, Badge, ButtonLink } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { PermissionPicker } from "../PermissionPicker";
import { createRole, duplicateRole } from "./actions";

export const metadata = { title: "Roles" };

export default async function RolesPage() {
  const ctx = await requireUser();
  if (!ctx.tenantId || !can(ctx, "iam.roles.manage")) redirect("/portal?denied=iam.roles.manage");
  const roles = await prisma.role.findMany({ where: { tenantId: ctx.tenantId }, include: { _count: { select: { assignments: true } } }, orderBy: { name: "asc" } });
  const locked = ungrantableAt(ctx, ALL_SCHOOL_PERMISSIONS, null);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Roles" subtitle="A role is a named set of permissions you can give to people" action={<ButtonLink href="/portal/settings/users" variant="ghost">← Users</ButtonLink>} />
      <Card>
        <ul className="divide-y divide-[color:var(--color-line)] text-sm">
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span><Link href={`/portal/settings/roles/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.name}</Link> {isStandardRoleName(r.name) && <Badge tone="slate">built-in</Badge>}<span className="block text-xs text-[color:var(--color-muted)]">{r.permissions.includes("*") ? "all permissions" : `${r.permissions.length} permissions`} · {r._count.assignments} assignment(s){r.description ? ` · ${r.description}` : ""}</span></span>
              <ActionForm action={duplicateRole} submit="Duplicate" variant="ghost"><input type="hidden" name="roleId" value={r.id} /></ActionForm>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold">New role</h3>
        <ActionForm action={createRole} submit="Create role" pendingLabel="Creating…" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className={labelCls}>Name</span><input name="name" required minLength={2} maxLength={60} placeholder="e.g. Exam Officer" className={inputCls} /></label>
            <label><span className={labelCls}>Description (optional)</span><input name="description" maxLength={200} className={inputCls} /></label>
          </div>
          <PermissionPicker locked={locked} />
        </ActionForm>
      </Card>
    </div>
  );
}
