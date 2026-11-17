"use client";

import Link from "next/link";
import { useActionState } from "react";
import { use } from "react";
import { resetPasswordAction, type ResetPasswordState } from "./actions";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = use(searchParams);
  const [state, formAction, pending] = useActionState<ResetPasswordState, FormData>(
    resetPasswordAction,
    {},
  );

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <p className="text-sm text-slate-600">Invalid reset link. Please request a new one.</p>
          <Link href="/login/forgot-password" className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline">
            Request password reset
          </Link>
        </div>
      </div>
    );
  }

  if (state.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-inset ring-green-200">
            Password reset successfully. All sessions have been signed out.
          </div>
          <Link href="/login" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Sign in with your new password
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set new password</h1>
          <p className="mt-2 text-sm text-slate-500">
            Min. 8 characters, one uppercase letter and one digit.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
              New password
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              required
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
          </div>

          {state.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? "Resetting…" : "Reset password"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
