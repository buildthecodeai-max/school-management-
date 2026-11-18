"use client";

import { useActionState } from "react";
import { cancelMfaAction, verifyLoginMfaAction, type MfaLoginState } from "./actions";

export function MfaForm() {
  const [state, action, pending] = useActionState<MfaLoginState, FormData>(verifyLoginMfaAction, {});
  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="code" className="block text-sm font-medium text-slate-700">
            6-digit code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </div>
        {state.error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Checking…" : "Verify"}
        </button>
      </form>
      <form action={cancelMfaAction}>
        <button className="w-full text-center text-sm text-slate-500 hover:underline">Cancel and sign in again</button>
      </form>
    </div>
  );
}
