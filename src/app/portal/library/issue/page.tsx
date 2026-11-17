"use client";

import { useActionState, useState } from "react";
import { issueBook } from "../actions";
import type { LibraryActionState } from "../actions";

const inputCls = "w-full rounded-md border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export default function IssueBookPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string }>;
}) {
  return <IssueBookClient />;
}

function IssueBookClient() {
  const [state, action, pending] = useActionState<LibraryActionState, FormData>(issueBook, {});
  const [campusId] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("campusId") ?? "";
    }
    return "";
  });

  return (
    <main className="mx-auto max-w-lg p-6 space-y-6">
      <div>
        <a href="/portal/library" className="text-sm text-brand-700 hover:underline">← Library</a>
        <h1 className="mt-2 text-2xl font-bold">Issue book</h1>
      </div>

      <form action={action} className="space-y-4 rounded-lg border border-[color:var(--color-line)] bg-white p-6">
        <input type="hidden" name="campusId" value={campusId} />

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">Copy barcode</label>
          <input name="copyId" required placeholder="Scan or enter copy barcode" className={inputCls} />
          <p className="mt-1 text-xs text-[color:var(--color-muted)]">Enter the copy ID or barcode from the book</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">Borrower user ID</label>
          <input name="borrowerUserId" required placeholder="Student or staff user ID" className={inputCls} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">Loan period (days)</label>
          <select name="dueDays" className={inputCls} defaultValue="14">
            <option value="7">7 days</option>
            <option value="14">14 days (standard)</option>
            <option value="21">21 days</option>
            <option value="30">30 days</option>
          </select>
        </div>

        {state.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
        )}
        {state.message && (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Issuing…" : "Issue book"}
        </button>
      </form>
    </main>
  );
}
