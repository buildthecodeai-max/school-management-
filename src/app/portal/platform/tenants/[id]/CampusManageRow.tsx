"use client";

import { useActionState, useEffect, useState } from "react";
import {
  platformUpdateCampus,
  platformSetCampusStatus,
  type TenantActionState,
} from "../../actions";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export interface CampusRow {
  id: string;
  name: string;
  code: string;
  city: string | null;
  timezone: string;
  status: string;
  enrollments: number;
  sections: number;
}

export function CampusManageRow({ c }: { c: CampusRow }) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction, editPending] = useActionState<TenantActionState, FormData>(
    platformUpdateCampus,
    {},
  );
  const [statusState, statusAction, statusPending] = useActionState<TenantActionState, FormData>(
    platformSetCampusStatus,
    {},
  );
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (editState.ok) setEditing(false);
  }, [editState]);

  if (editing) {
    return (
      <tr className="border-b border-[color:var(--color-line)] bg-[color:var(--color-surface2)] last:border-0">
        <td colSpan={7} className="px-5 py-3">
          <form action={editAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="campusId" value={c.id} />
            <div>
              <label className="mb-0.5 block text-[10px] font-medium uppercase text-[color:var(--color-muted)]">Name</label>
              <input name="name" defaultValue={c.name} required className={inputCls} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium uppercase text-[color:var(--color-muted)]">Code</label>
              <input name="code" defaultValue={c.code} required maxLength={12} className={`${inputCls} w-28 uppercase`} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium uppercase text-[color:var(--color-muted)]">City</label>
              <input name="city" defaultValue={c.city ?? ""} className={inputCls} />
            </div>
            <div>
              <label className="mb-0.5 block text-[10px] font-medium uppercase text-[color:var(--color-muted)]">Timezone</label>
              <input name="timezone" defaultValue={c.timezone} className={`${inputCls} w-40`} />
            </div>
            <button
              disabled={editPending}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {editPending ? "…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-sm hover:bg-white"
            >
              Cancel
            </button>
            {editState.error && <span className="w-full text-xs text-red-600">{editState.error}</span>}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[color:var(--color-line)] last:border-0">
      <td className="px-5 py-3 font-medium">{c.name}</td>
      <td className="px-5 py-3 font-mono text-xs">{c.code}</td>
      <td className="px-5 py-3 text-[color:var(--color-muted)]">{c.city ?? "—"}</td>
      <td className="px-5 py-3">
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            c.status === "ACTIVE"
              ? "bg-green-50 text-green-700"
              : c.status === "CLOSED"
                ? "bg-slate-100 text-slate-500"
                : "bg-amber-50 text-amber-700"
          }`}
        >
          {c.status}
        </span>
      </td>
      <td className="px-5 py-3">{c.enrollments}</td>
      <td className="px-5 py-3">{c.sections}</td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            onClick={() => setEditing(true)}
            className="rounded border border-[color:var(--color-line)] px-2 py-1 text-xs font-medium hover:bg-slate-50"
          >
            Edit
          </button>
          {c.status !== "ACTIVE" && c.status !== "CLOSED" && (
            <form action={statusAction}>
              <input type="hidden" name="campusId" value={c.id} />
              <input type="hidden" name="status" value="ACTIVE" />
              <button
                disabled={statusPending}
                className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
              >
                Activate
              </button>
            </form>
          )}
          {c.status === "ACTIVE" && (
            <form action={statusAction}>
              <input type="hidden" name="campusId" value={c.id} />
              <input type="hidden" name="status" value="SUSPENDED" />
              <button
                disabled={statusPending}
                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                Suspend
              </button>
            </form>
          )}
          {c.status !== "CLOSED" &&
            (confirmClose ? (
              <form action={statusAction} className="flex items-center gap-1">
                <input type="hidden" name="campusId" value={c.id} />
                <input type="hidden" name="status" value="CLOSED" />
                <button
                  disabled={statusPending}
                  className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {statusPending ? "…" : "Confirm close"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClose(false)}
                  className="text-xs text-[color:var(--color-muted)] hover:underline"
                >
                  cancel
                </button>
              </form>
            ) : (
              <button
                onClick={() => setConfirmClose(true)}
                className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                Close
              </button>
            ))}
        </div>
        {statusState.error && (
          <p className="mt-1 text-right text-xs text-red-600">{statusState.error}</p>
        )}
      </td>
    </tr>
  );
}
