"use client";

import { useActionState } from "react";
import Link from "next/link";
import { bulkPromoteGrade } from "../actions";

const initial = { ok: false, error: undefined as string | undefined, message: undefined as string | undefined, affectedCount: undefined as number | undefined };

export default function BulkActionsPage() {
  const [state, action, pending] = useActionState(bulkPromoteGrade, initial);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <Link href="/portal/students" className="text-sm text-brand-700 hover:underline">
          ← Students
        </Link>
      </div>

      <h1 className="mb-1 text-2xl font-bold">Bulk student actions</h1>
      <p className="mb-6 text-sm text-[color:var(--color-muted)]">
        Year-end promotion moves all active students in a grade to the next grade and academic year.
        Run the preview first to see how many students will be affected.
      </p>

      {state.error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </div>
      )}
      {state.ok && state.message && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-inset ring-green-200">
          {state.message}
          {state.affectedCount !== undefined && (
            <span className="ml-2 font-semibold">({state.affectedCount} student{state.affectedCount !== 1 ? "s" : ""})</span>
          )}
        </div>
      )}

      <div className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-6">
        <h2 className="mb-4 font-semibold">Grade promotion</h2>

        <form action={action} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Campus ID</label>
            <input name="campusId" required className={inp} placeholder="e.g. camp_abc123" />
            <p className="mt-1 text-xs text-[color:var(--color-muted)]">Find it in the campus URL or settings.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">From grade (ID)</label>
              <input name="fromGradeLevelId" required className={inp} placeholder="grade_..." />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">To grade (ID)</label>
              <input name="toGradeLevelId" required className={inp} placeholder="grade_..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Destination section (ID)</label>
              <input name="toSectionId" required className={inp} placeholder="sec_..." />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">New academic year (ID)</label>
              <input name="toAcademicYearId" required className={inp} placeholder="ay_..." />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              formAction={async (fd) => { fd.set("preview", "true"); await action(fd); }}
              disabled={pending}
              className="rounded-lg border border-[color:var(--color-line)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Preview (dry run)
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {pending ? "Promoting…" : "Promote students"}
            </button>
          </div>
          <p className="text-xs text-[color:var(--color-muted)]">
            This closes existing enrollments and opens new ones in the destination grade. It cannot be undone in bulk — confirm counts with the preview first.
          </p>
        </form>
      </div>
    </div>
  );
}

const inp = "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
