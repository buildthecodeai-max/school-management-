"use client";

import { useActionState, useEffect, useState } from "react";
import { createPlan, deletePlan, type TenantActionState } from "../actions";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

export function NewPlanForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    createPlan,
    {},
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="mb-6">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New plan
        </button>
        {state.message && <p className="mt-2 text-sm text-green-700">{state.message}</p>}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mb-6 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5"
    >
      <h3 className="mb-4 font-semibold">New plan</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div>
          <label className={labelCls} htmlFor="np-name">Name</label>
          <input id="np-name" name="name" required placeholder="Academy" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="np-code">Code</label>
          <input id="np-code" name="code" required placeholder="academy" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="np-price">Price / mo</label>
          <input id="np-price" name="priceMonthly" type="number" min="0" step="0.01" required defaultValue="0" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="np-students">Max students</label>
          <input id="np-students" name="maxStudents" type="number" min="1" required defaultValue="500" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="np-campuses">Max campuses</label>
          <input id="np-campuses" name="maxCampuses" type="number" min="1" required defaultValue="1" className={inputCls} />
        </div>
      </div>

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create plan"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[color:var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-[color:var(--color-surface2)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DeletePlanButton({
  planId,
  subscriberCount,
}: {
  planId: string;
  subscriberCount: number;
}) {
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    deletePlan,
    {},
  );

  if (subscriberCount > 0) {
    return (
      <span className="text-xs text-[color:var(--color-muted)]">
        In use — cannot delete
      </span>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="planId" value={planId} />
      <button
        disabled={pending}
        className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
      >
        {pending ? "…" : "Delete plan"}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
