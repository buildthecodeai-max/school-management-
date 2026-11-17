"use client";

import { useActionState } from "react";
import { updatePlan, type TenantActionState } from "../actions";
import { DeletePlanButton } from "./NewPlanForm";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

export function PlanForm({
  plan,
}: {
  plan: {
    id: string;
    code: string;
    name: string;
    priceMonthly: number;
    currency: string;
    maxStudents: number;
    maxCampuses: number;
    isActive: boolean;
    subscriberCount: number;
  };
}) {
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    updatePlan,
    {},
  );

  return (
    // The header's delete control is its own <form>, so it must be a sibling of
    // the update form rather than a child — nested forms are invalid HTML and
    // break hydration.
    <div className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold">{plan.name}</h3>
          <span className="font-mono text-xs text-[color:var(--color-muted)]">{plan.code}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[color:var(--color-muted)]">
            {plan.subscriberCount} subscriber{plan.subscriberCount === 1 ? "" : "s"}
          </span>
          <DeletePlanButton planId={plan.id} subscriberCount={plan.subscriberCount} />
        </div>
      </div>

      <form action={formAction}>
        <input type="hidden" name="planId" value={plan.id} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className={labelCls} htmlFor={`n-${plan.id}`}>Name</label>
          <input id={`n-${plan.id}`} name="name" required defaultValue={plan.name} className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor={`p-${plan.id}`}>
            Price / mo ({plan.currency})
          </label>
          <input
            id={`p-${plan.id}`}
            name="priceMonthly"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={(plan.priceMonthly / 100).toFixed(2)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={`s-${plan.id}`}>Max students</label>
          <input
            id={`s-${plan.id}`}
            name="maxStudents"
            type="number"
            min="1"
            required
            defaultValue={plan.maxStudents}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={`c-${plan.id}`}>Max campuses</label>
          <input
            id={`c-${plan.id}`}
            name="maxCampuses"
            type="number"
            min="1"
            required
            defaultValue={plan.maxCampuses}
            className={inputCls}
          />
        </div>
      </div>

        <div className="mt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={plan.isActive} className="rounded" />
            Available for new subscriptions
          </label>

          <div className="flex items-center gap-3">
            {state.error && <span className="text-sm text-red-600">{state.error}</span>}
            {state.message && <span className="text-sm text-green-700">{state.message}</span>}
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
