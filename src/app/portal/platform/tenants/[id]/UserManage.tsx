"use client";

import { useActionState, useEffect, useState } from "react";
import {
  platformCreateUser,
  platformAssignRole,
  platformRemoveRoleAssignment,
  platformEditUser,
  type TenantActionState,
} from "../../actions";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

export function EditUserForm({ userId, displayName, email }: { userId: string; displayName: string; email: string }) {
  const [state, action, pending] = useActionState(platformEditUser, {});
  return <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand-700">Edit user</summary>
    <form action={action} className="space-y-2 py-2">
      <input type="hidden" name="userId" value={userId} />
      <label className="block">Name<input name="displayName" defaultValue={displayName} required className={inputCls} /></label>
      <label className="block">Email<input name="email" type="email" defaultValue={email} required className={inputCls} /></label>
      <button disabled={pending} className="rounded border px-3 py-1">Save user</button>
      <p role="status">{state.error || state.message}</p>
    </form>
  </details>;
}

export interface RoleOption {
  id: string;
  name: string;
}
export interface CampusOption {
  id: string;
  name: string;
}

function ScopePicker({ campuses }: { campuses: CampusOption[] }) {
  const [scope, setScope] = useState<"ORG" | "CAMPUS">("ORG");
  return (
    <>
      <div>
        <label className={labelCls}>Scope</label>
        <select
          name="scopeType"
          value={scope}
          onChange={(e) => setScope(e.target.value as "ORG" | "CAMPUS")}
          className={inputCls}
        >
          <option value="ORG">Whole school</option>
          <option value="CAMPUS">One campus</option>
        </select>
      </div>
      {scope === "CAMPUS" && (
        <div>
          <label className={labelCls}>Campus</label>
          <select name="campusId" required className={inputCls}>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}

export function AddUserForm({
  tenantId,
  roles,
  campuses,
}: {
  tenantId: string;
  roles: RoleOption[];
  campuses: CampusOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    platformCreateUser,
    {},
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="px-5 pb-4">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          + Add user
        </button>
        {state.message && (
          <p className="mt-2 max-w-xl text-sm text-green-700">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="mx-5 mb-4 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface2)] p-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelCls}>Name</label>
          <input name="displayName" required placeholder="Jordan Blake" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input name="email" type="email" required placeholder="jordan@school.edu" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Role</label>
          <select name="roleId" required className={inputCls}>
            <option value="">Choose…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <ScopePicker campuses={campuses} />
        <label className={labelCls}>Profile type<select name="profileType" className={inputCls}><option value="STAFF">Staff / teacher</option><option value="GUARDIAN">Parent / guardian</option></select></label>
      </div>

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create user"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[color:var(--color-line)] px-4 py-1.5 text-sm font-medium hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export interface AssignmentRow {
  id: string;
  roleName: string;
  scopeType: string;
  campusName: string | null;
}

export function RoleChips({ assignments }: { assignments: AssignmentRow[] }) {
  const [state, action, pending] = useActionState<TenantActionState, FormData>(
    platformRemoveRoleAssignment,
    {},
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {assignments.map((a) => (
        <form action={action} key={a.id} className="inline-flex">
          <input type="hidden" name="assignmentId" value={a.id} />
          <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-line)] bg-slate-50 py-0.5 pl-2 pr-1 text-xs">
            {a.roleName}
            <span className="text-[color:var(--color-muted)]">
              {a.scopeType === "CAMPUS" ? `· ${a.campusName}` : "· org-wide"}
            </span>
            <button
              disabled={pending}
              title="Remove this role"
              className="ml-0.5 rounded-full px-1 text-[color:var(--color-muted)] hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
            >
              ×
            </button>
          </span>
        </form>
      ))}
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </div>
  );
}

export function AssignRoleForm({
  userId,
  roles,
  campuses,
}: {
  userId: string;
  roles: RoleOption[];
  campuses: CampusOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<TenantActionState, FormData>(
    platformAssignRole,
    {},
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-brand-700 hover:underline"
      >
        + role
      </button>
    );
  }

  return (
    <form action={action} className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="userId" value={userId} />
      <select name="roleId" required className="rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs">
        <option value="">Role…</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <select name="scopeType" className="rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs" defaultValue="ORG" id={`scope-${userId}`}>
        <option value="ORG">org-wide</option>
        <option value="CAMPUS">campus</option>
      </select>
      <select name="campusId" className="rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs">
        <option value="">(if campus)</option>
        {campuses.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <button
        disabled={pending}
        className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "…" : "Grant"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-[color:var(--color-muted)] hover:underline"
      >
        cancel
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
