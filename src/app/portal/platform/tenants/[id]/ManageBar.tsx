"use client";

import { useActionState, useState } from "react";
import { quickSetTenantStatus, type TenantActionState } from "../../actions";

// A single visible action bar at the top of the tenant page: the three things
// a platform operator does most — suspend/reactivate, jump to edit, jump to
// delete — instead of scrolling past campuses and users to find them.
export function ManageBar({
  tenantId,
  status,
}: {
  tenantId: string;
  status: string;
}) {
  const [state, action, pending] = useActionState<TenantActionState, FormData>(
    quickSetTenantStatus,
    {},
  );
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-3">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">
        Manage this school:
      </span>

      {status === "ACTIVE" || status === "TRIAL" ? (
        confirmSuspend ? (
          <form action={action} className="flex items-center gap-1.5">
            <input type="hidden" name="tenantId" value={tenantId} />
            <input type="hidden" name="status" value="SUSPENDED" />
            <span className="text-sm text-amber-700">Suspend — users lose access. Confirm?</span>
            <button
              disabled={pending}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? "…" : "Yes, suspend"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmSuspend(false)}
              className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setConfirmSuspend(true)}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100"
          >
            Suspend
          </button>
        )
      ) : status === "SUSPENDED" ? (
        <form action={action}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="status" value="ACTIVE" />
          <button
            disabled={pending}
            className="rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
          >
            {pending ? "…" : "Reactivate"}
          </button>
        </form>
      ) : null}

      <button
        onClick={() => scrollTo("edit-school")}
        className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
      >
        Edit details
      </button>
      <button
        onClick={() => scrollTo("danger-zone")}
        className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete school
      </button>

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}
      {state.message && <span className="text-sm text-green-700">{state.message}</span>}
    </div>
  );
}
