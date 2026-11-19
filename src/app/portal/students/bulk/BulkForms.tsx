"use client";

import { useActionState, useState } from "react";
import { bulkPromoteGrade, bulkReassignSection, type BulkState } from "../actions";
import { inputCls, labelCls } from "@/components/ActionForm";

type Opt = { id: string; label: string };

// Preview first. The confirm button appears only for the exact choices that were previewed.
function TwoStep({ action, children, previewLabel, confirmLabel }: { action: (p: BulkState, f: FormData) => Promise<BulkState>; children: React.ReactNode; previewLabel: string; confirmLabel: string }) {
  const [state, dispatch, pending] = useActionState(action, {} as BulkState);
  const [stale, setStale] = useState(true);
  return (
    <form action={(fd) => { dispatch(fd); setStale(fd.get("mode") === "commit"); }} onChange={() => setStale(true)} className="space-y-3">
      {children}
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>}
      {state.ok && state.message && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 ring-1 ring-inset ring-green-200">
          <p>{state.message}</p>
          {state.studentNames && <p className="mt-1 max-h-32 overflow-y-auto text-xs">{state.studentNames.join(", ")}</p>}
        </div>
      )}
      <div className="flex gap-2">
        <button name="mode" value="preview" disabled={pending} className="rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50 disabled:opacity-60">{previewLabel}</button>
        {state.ok && state.studentNames && !stale && (
          <button name="mode" value="commit" disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{pending ? "Working…" : confirmLabel}</button>
        )}
      </div>
    </form>
  );
}

const Select = ({ name, label, options }: { name: string; label: string; options: Opt[] }) => (
  <label className="block"><span className={labelCls}>{label}</span>
    <select name={name} required className={inputCls}><option value="">Choose…</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
);

export function PromoteForm({ grades, sections }: { grades: Opt[]; sections: Opt[] }) {
  return (
    <TwoStep action={bulkPromoteGrade} previewLabel="Preview promotion" confirmLabel="Promote these students">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select name="fromGradeLevelId" label="Promote everyone in" options={grades} />
        <Select name="toSectionId" label="Into this section (next grade, next year)" options={sections} />
      </div>
    </TwoStep>
  );
}

export function ReassignForm({ sections }: { sections: Opt[] }) {
  return (
    <TwoStep action={bulkReassignSection} previewLabel="Preview move" confirmLabel="Move these students">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select name="fromSectionId" label="Move everyone from" options={sections} />
        <Select name="toSectionId" label="To (same grade and year)" options={sections} />
      </div>
    </TwoStep>
  );
}
