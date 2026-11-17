"use client";

import { useActionState } from "react";
import { quickSetTenantStatus, type TenantActionState } from "./actions";

// Row-level suspend/reactivate so the most common lifecycle action never
// requires leaving the list. Anything less common (edit, delete, add campus)
// stays on the detail page.
export function TenantRowActions({
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

  if (status === "CLOSED") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={action}>
        <input type="hidden" name="tenantId" value={tenantId} />
        <input
          type="hidden"
          name="status"
          value={status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"}
        />
        <button
          disabled={pending}
          className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
            status === "SUSPENDED"
              ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
              : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          }`}
        >
          {pending ? "…" : status === "SUSPENDED" ? "Reactivate" : "Suspend"}
        </button>
      </form>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </div>
  );
}
