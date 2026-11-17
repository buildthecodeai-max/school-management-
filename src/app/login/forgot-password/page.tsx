"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPasswordAction, type ForgotPasswordState } from "./actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ForgotPasswordState, FormData>(
    forgotPasswordAction,
    {},
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reset password</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>

        {state.message ? (
          <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-inset ring-green-200">
            {state.message}
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                placeholder="you@school.edu"
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
              {pending ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
