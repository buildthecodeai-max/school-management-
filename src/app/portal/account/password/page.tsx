"use client";

import { useActionState } from "react";
import { changePasswordAction, type ChangePasswordState } from "./actions";
import { PageHeader } from "@/components/ui";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

export default function ChangePasswordPage() {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(
    changePasswordAction,
    {},
  );

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Change password" subtitle="Update your account password" />

      <form
        action={formAction}
        className="mt-6 space-y-4 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5"
      >
        <div>
          <label htmlFor="currentPassword" className={labelCls}>Current password</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputCls}
          />
        </div>
        <div>
          <label htmlFor="newPassword" className={labelCls}>New password</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            autoComplete="new-password"
            className={inputCls}
          />
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">Min. 8 characters, one uppercase letter and one digit.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className={labelCls}>Confirm new password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className={inputCls}
          />
        </div>

        {state.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-inset ring-green-200">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Change password"}
        </button>
      </form>
    </div>
  );
}
