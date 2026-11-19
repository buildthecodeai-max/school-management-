"use client";

import { useActionState, useState } from "react";
import { cloneCampusConfig, type CloneState } from "./clone-actions";
import { inputCls, labelCls } from "@/components/ActionForm";

export function CloneForm({ campuses }: { campuses: { id: string; name: string }[] }) {
  const [state, dispatch, pending] = useActionState(cloneCampusConfig, {} as CloneState);
  const [stale, setStale] = useState(true);
  const pv = state.preview;
  return (
    <form action={(fd) => { dispatch(fd); setStale(fd.get("mode") === "commit"); }} onChange={() => setStale(true)} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={labelCls}>Copy from</span><select name="sourceCampusId" required className={inputCls}><option value="">Choose…</option>{campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span className={labelCls}>Copy into (must be empty)</span><select name="targetCampusId" required className={inputCls}><option value="">Choose…</option>{campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="cloneAcademicStructure" value="true" defaultChecked /> Years, terms, grades and sections</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="cloneFeeStructures" value="true" defaultChecked /> Fee structures (start inactive)</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="cloneAssessmentPlans" value="true" defaultChecked /> Assessment plans (no marks)</label>
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>}
      {state.ok && state.message && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 ring-1 ring-inset ring-green-200">
          <p>{state.message}</p>
          {pv && <p className="mt-1 text-xs">{pv.academicYears} year(s), {pv.terms} term(s), {pv.gradeLevels} grade(s), {pv.sections} section(s), {pv.feeStructures} fee structure(s), {pv.assessmentPlans} assessment plan(s).</p>}
        </div>
      )}
      <div className="flex gap-2">
        <button name="mode" value="preview" disabled={pending} className="rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50 disabled:opacity-60">Preview</button>
        {state.ok && pv && !stale && <button name="mode" value="commit" disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{pending ? "Copying…" : "Copy now"}</button>}
      </div>
    </form>
  );
}
