"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";

export interface FormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// A form bound to a Server Action that returns { ok | error, message }.
// Shows the result inline; `confirmText` asks before submitting (deletes).
export function ActionForm({
  action,
  children,
  submit,
  pendingLabel,
  className = "",
  confirmText,
  variant = "primary",
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submit: string;
  pendingLabel?: string;
  className?: string;
  confirmText?: string;
  variant?: "primary" | "ghost" | "danger";
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  // Keep what the user typed when the server rejects it; clear only on success.
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const btn =
    variant === "danger"
      ? "rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
      : variant === "ghost"
        ? "rounded-md border border-[color:var(--color-line)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
        : "rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700";
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmText && !window.confirm(confirmText)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => dispatch(data));
      }}
    >
      {children}
      <button disabled={pending} className={`${btn} disabled:opacity-60`}>
        {pending ? (pendingLabel ?? "Saving…") : submit}
      </button>
      {state.error && (
        <p role="alert" className="mt-1.5 text-sm text-red-600">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="mt-1.5 text-sm text-green-700">
          {state.message}
        </p>
      )}
    </form>
  );
}

export const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
export const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";
