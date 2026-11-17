"use client";

import { useActionState } from "react";
import {
  updateSubscription,
  setUserStatus,
  resetUserPassword,
  type TenantActionState,
} from "../../actions";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

function isoDate(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function SubscriptionPanel({
  tenantId,
  status,
  trialEndsAt,
  currentPeriodEnd,
  usage,
}: {
  tenantId: string;
  status: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  usage: {
    planName: string;
    students: number;
    maxStudents: number;
    campuses: number;
    maxCampuses: number;
    seats: number;
    overLimit: boolean;
  } | null;
}) {
  const [state, formAction, pending] = useActionState<TenantActionState, FormData>(
    updateSubscription,
    {},
  );

  return (
    <form
      action={formAction}
      className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5"
    >
      <h3 className="mb-4 font-semibold">Subscription</h3>
      <input type="hidden" name="tenantId" value={tenantId} />

      {usage && (
        <div className="mb-5 grid grid-cols-3 gap-4">
          <UsageBar
            label="Students"
            used={usage.students}
            limit={usage.maxStudents}
          />
          <UsageBar
            label="Campuses"
            used={usage.campuses}
            limit={usage.maxCampuses}
          />
          <div>
            <p className={labelCls}>Active seats</p>
            <p className="text-lg font-semibold tabular-nums">{usage.seats}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="s-status">Billing status</label>
          <select id="s-status" name="status" defaultValue={status} className={inputCls}>
            <option value="TRIAL">Trial</option>
            <option value="ACTIVE">Active</option>
            <option value="PAST_DUE">Past due</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="s-trial">Trial ends</label>
          <input
            id="s-trial"
            name="trialEndsAt"
            type="date"
            defaultValue={isoDate(trialEndsAt)}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="s-renew">Renews on</label>
          <input
            id="s-renew"
            name="currentPeriodEnd"
            type="date"
            defaultValue={isoDate(currentPeriodEnd)}
            className={inputCls}
          />
        </div>
      </div>

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="mt-3 text-sm text-green-700">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save subscription"}
      </button>
    </form>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const over = used > limit;
  const near = !over && pct >= 80;
  const barColor = over ? "bg-red-500" : near ? "bg-amber-500" : "bg-brand-600";

  return (
    <div>
      <p className={labelCls}>{label}</p>
      <p className="text-lg font-semibold tabular-nums">
        {used}
        <span className="text-sm font-normal text-[color:var(--color-muted)]"> / {limit}</span>
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-line)]">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {over && <p className="mt-1 text-xs text-red-600">Over limit by {used - limit}</p>}
    </div>
  );
}

export function UserRowActions({
  userId,
  status,
}: {
  userId: string;
  status: string;
}) {
  const [statusState, statusAction, statusPending] = useActionState<
    TenantActionState,
    FormData
  >(setUserStatus, {});
  const [resetState, resetAction, resetPending] = useActionState<
    TenantActionState,
    FormData
  >(resetUserPassword, {});

  const nextStatus = status === "ACTIVE" ? "DISABLED" : "ACTIVE";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={statusAction}>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="status" value={nextStatus} />
          <button
            disabled={statusPending}
            className={`rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${
              status === "ACTIVE"
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
            }`}
          >
            {statusPending ? "…" : status === "ACTIVE" ? "Disable" : "Enable"}
          </button>
        </form>
        <form action={resetAction}>
          <input type="hidden" name="userId" value={userId} />
          <button
            disabled={resetPending}
            className="rounded border border-[color:var(--color-line)] px-2 py-1 text-xs font-medium hover:bg-[color:var(--color-surface2)] disabled:opacity-50"
          >
            {resetPending ? "…" : "Reset password"}
          </button>
        </form>
      </div>
      {(statusState.error || resetState.error) && (
        <span className="text-xs text-red-600">
          {statusState.error ?? resetState.error}
        </span>
      )}
      {resetState.message && (
        <span className="max-w-xs text-right text-xs font-medium text-green-700">
          {resetState.message}
        </span>
      )}
    </div>
  );
}
