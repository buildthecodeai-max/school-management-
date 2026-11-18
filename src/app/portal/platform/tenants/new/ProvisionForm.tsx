"use client";

import Link from "next/link";
import { useActionState } from "react";
import { provisionTenantAction, type ProvisionState } from "./actions";

const inputCls =
  "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function ProvisionForm({ plans }: { plans: { id: string; name: string; maxStudents: number; maxCampuses: number }[] }) {
  const [state, action, pending] = useActionState<ProvisionState, FormData>(provisionTenantAction, {});

  if (state.ok && state.tenantId) {
    return (
      <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-5">
        <p className="font-semibold text-green-900">{state.created ? "School created." : "School updated."}</p>
        <p className="text-sm text-green-900">
          <strong>{state.adminEmail}</strong> is the organization owner. Send them this one-time link so they can choose a password
          (valid 7 days; it is also in their inbox). It is shown only here.
        </p>
        <input readOnly value={state.inviteUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" className={`${inputCls} font-mono text-xs`} />
        <div className="flex gap-3">
          <Link href={`/portal/platform/tenants/${state.tenantId}`} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Open the school
          </Link>
          <Link href="/portal/platform" className="rounded-lg px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-white">
            Back to platform
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">School name</label>
          <input name="name" required placeholder="Greenwood Academy" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Slug (unique URL key)</label>
          <input name="slug" required placeholder="greenwood" pattern="[a-z0-9\-]{2,40}" className={inputCls} />
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">Lowercase letters, digits, hyphens only.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Plan</label>
          <select name="planId" required className={inputCls}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (up to {p.maxStudents} students, {p.maxCampuses} campus{p.maxCampuses === 1 ? "" : "es"})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Main campus name</label>
          <input name="campusName" placeholder="Main Campus (default)" className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Admin email</label>
          <input name="adminEmail" type="email" required placeholder="admin@school.edu" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Admin display name</label>
          <input name="adminName" placeholder="School Admin" className={inputCls} />
        </div>
      </div>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>}
      <div className="flex gap-3 pt-2">
        <button disabled={pending} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {pending ? "Creating…" : "Create school"}
        </button>
        <Link href="/portal/platform" className="rounded-lg px-5 py-2.5 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">
          Cancel
        </Link>
      </div>
    </form>
  );
}
