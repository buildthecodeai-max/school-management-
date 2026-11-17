"use client";

import { useActionState, useEffect, useState } from "react";
import { platformCreateCampus, type TenantActionState } from "../../actions";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

export function PlatformCampusForm({
  tenantId,
  defaultTimezone,
}: {
  tenantId: string;
  defaultTimezone: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    platformCreateCampus,
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
          + Add campus
        </button>
        {state.message && <p className="mt-2 text-sm text-green-700">{state.message}</p>}
      </div>
    );
  }

  return (
    <form action={formAction} className="mx-5 mb-4 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface2)] p-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="pc-name">Name</label>
          <input id="pc-name" name="name" required placeholder="Downtown Campus" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="pc-code">Code</label>
          <input id="pc-code" name="code" required maxLength={12} placeholder="DOWN" className={`${inputCls} uppercase`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="pc-city">City</label>
          <input id="pc-city" name="city" placeholder="Optional" className={inputCls} />
        </div>
      </div>
      <input type="hidden" name="timezone" value={defaultTimezone} />

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create campus"}
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
