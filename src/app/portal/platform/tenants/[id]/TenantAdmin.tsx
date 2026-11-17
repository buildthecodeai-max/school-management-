"use client";

import { useActionState, useState } from "react";
import { updateTenant, deleteTenant, type TenantActionState } from "../../actions";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

type Plan = { id: string; name: string };

export function EditTenantForm({
  tenantId,
  name,
  status,
  planId,
  plans,
}: {
  tenantId: string;
  name: string;
  status: string;
  planId: string | null;
  plans: Plan[];
}) {
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    updateTenant,
    {},
  );

  return (
    <form
      action={formAction}
      className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5"
    >
      <h3 className="mb-4 font-semibold">Organization settings</h3>
      <input type="hidden" name="tenantId" value={tenantId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className={labelCls} htmlFor="t-name">Name</label>
          <input id="t-name" name="name" required defaultValue={name} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="t-status">Status</label>
          <select id="t-status" name="status" defaultValue={status} className={inputCls}>
            <option value="TRIAL">Trial</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="t-plan">Plan</label>
          <select id="t-plan" name="planId" defaultValue={planId ?? ""} className={inputCls}>
            {!planId && <option value="">No subscription</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="mt-3 text-sm text-green-700">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

export function DeleteTenantPanel({
  tenantId,
  slug,
  status,
  campusCount,
  userCount,
}: {
  tenantId: string;
  slug: string;
  status: string;
  campusCount: number;
  userCount: number;
}) {
  const [armed, setArmed] = useState(false);
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    deleteTenant,
    {},
  );

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-5">
      <h3 className="font-semibold text-red-800">Delete organization</h3>
      <p className="mt-1 text-sm text-red-700">
        Permanently removes this organization and all {campusCount} campus(es),{" "}
        {userCount} user(s), roles and academic records. This cannot be undone.
      </p>

      {status !== "CLOSED" ? (
        <p className="mt-3 text-sm text-red-700">
          Set status to <strong>Closed</strong> above first. Closing is reversible; deletion is not.
        </p>
      ) : !armed ? (
        <button
          onClick={() => setArmed(true)}
          className="mt-3 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Delete this organization
        </button>
      ) : (
        <form action={formAction} className="mt-3">
          <input type="hidden" name="tenantId" value={tenantId} />
          <label className={labelCls} htmlFor="t-confirm">
            Type <span className="font-mono normal-case text-red-700">{slug}</span> to confirm
          </label>
          <input
            id="t-confirm"
            name="confirmSlug"
            required
            autoComplete="off"
            placeholder={slug}
            className={`${inputCls} max-w-xs`}
          />
          {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => setArmed(false)}
              className="rounded-md border border-[color:var(--color-line)] bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
