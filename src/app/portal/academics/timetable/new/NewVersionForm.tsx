"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { createTimetableVersion, type TimetableActionState } from "../actions";
import { inputCls, labelCls } from "@/components/ActionForm";

export function NewVersionForm({ years }: { years: { id: string; label: string }[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createTimetableVersion, {} as TimetableActionState);
  useEffect(() => {
    if (state.ok && state.versionId) router.push(`/portal/academics/timetable/${state.versionId}`);
  }, [state, router]);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className={labelCls}>Academic year</span>
        <select name="academicYearId" required className={inputCls}>
          {years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelCls}>Version name</span>
        <input name="name" required maxLength={100} placeholder="e.g. Term 1 2026" className={inputCls} />
      </label>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>}
      <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
        {pending ? "Creating…" : "Create and add slots"}
      </button>
    </form>
  );
}
