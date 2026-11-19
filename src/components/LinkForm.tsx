"use client";

import { useActionState, type ReactNode } from "react";

type State = { ok?: boolean; error?: string; message?: string; inviteUrl?: string };

/** A server-action form that can show a one-time link the action returned. */
export function LinkForm({ action, children, submit, className = "", variant = "primary" }: { action: (p: State, f: FormData) => Promise<State>; children?: ReactNode; submit: string; className?: string; variant?: "primary" | "ghost" }) {
  const [state, dispatch, pending] = useActionState(action, {} as State);
  return (
    <form action={dispatch} className={className}>
      {children}
      <button disabled={pending} className={variant === "primary" ? "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60" : "rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50 disabled:opacity-60"}>{pending ? "Working…" : submit}</button>
      {state.error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>}
      {state.ok && state.message && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-inset ring-green-200">{state.message}</p>}
      {state.inviteUrl && (
        <div className="mt-2">
          <input readOnly value={state.inviteUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" className="w-full rounded-md border border-[color:var(--color-line)] bg-slate-50 px-3 py-2 font-mono text-xs" />
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">Shown once. Copy it now; it cannot be shown again.</p>
        </div>
      )}
    </form>
  );
}
