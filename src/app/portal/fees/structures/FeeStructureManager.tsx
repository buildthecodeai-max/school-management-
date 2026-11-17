"use client";

import { useActionState, useState } from "react";
import {
  createFeeHead,
  updateFeeHead,
  deleteFeeHead,
  createFeeStructure,
  setFeeStructureActive,
  type FeeSetupState,
} from "../actions";

const input = "w-full rounded-md border border-[color:var(--color-line)] bg-white px-2 py-1.5 text-sm";
const categories = ["TUITION", "TRANSPORT", "MEALS", "LAB", "ACTIVITY", "EXAM", "OTHER"];

type Head = { id: string; name: string; code: string; category: string; taxRatePct: number; glAccountCode: string | null };
type Campus = { id: string; name: string; grades: { id: string; name: string }[]; years: { id: string; name: string }[] };

function Result({ state }: { state: FeeSetupState }) {
  return state.error ? <p role="alert" className="mt-2 text-sm text-red-600">{state.error}</p> : state.message ? <p role="status" className="mt-2 text-sm text-green-700">{state.message}</p> : null;
}

export function FeeHeadManager({ heads }: { heads: Head[] }) {
  const [createState, createAction, creating] = useActionState(createFeeHead, {});
  const [open, setOpen] = useState(false);
  return <div className="space-y-3">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Fee heads and funds</h3><button onClick={() => setOpen(!open)} className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white">{open ? "Close" : "Add fee head"}</button></div>
    <p className="text-sm text-[color:var(--color-muted)]">Define reusable tuition, fund, transport, examination and custom charge categories. Amounts are set per class structure.</p>
    {open && <form action={createAction} className="grid grid-cols-1 gap-2 rounded border p-3 sm:grid-cols-5">
      <input name="name" required placeholder="Sports Fund" className={input} />
      <input name="code" required placeholder="SPORTS" className={input} />
      <select name="category" className={input}>{categories.map(c => <option key={c}>{c}</option>)}</select>
      <input name="taxRatePct" type="number" min="0" max="100" defaultValue="0" className={input} />
      <div className="flex gap-2"><input name="glAccountCode" placeholder="GL code (optional)" className={input} /><button disabled={creating} className="rounded bg-brand-600 px-3 text-sm text-white">{creating ? "…" : "Create"}</button></div>
      <Result state={createState} />
    </form>}
    <div className="divide-y rounded border">
      {heads.map(head => <FeeHeadRow key={head.id} head={head} />)}
      {!heads.length && <p className="p-4 text-sm text-[color:var(--color-muted)]">No fee heads yet.</p>}
    </div>
  </div>;
}

function FeeHeadRow({ head }: { head: Head }) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updating] = useActionState(updateFeeHead, {});
  const [deleteState, deleteAction, deleting] = useActionState(deleteFeeHead, {});
  if (editing) return <form action={updateAction} className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-6"><input type="hidden" name="feeHeadId" value={head.id} /><input name="name" defaultValue={head.name} required className={input}/><input name="code" defaultValue={head.code} required className={input}/><select name="category" defaultValue={head.category} className={input}>{categories.map(c => <option key={c}>{c}</option>)}</select><input name="taxRatePct" type="number" min="0" max="100" defaultValue={head.taxRatePct} className={input}/><input name="glAccountCode" defaultValue={head.glAccountCode ?? ""} placeholder="GL code" className={input}/><div className="flex gap-2"><button disabled={updating} className="rounded bg-brand-600 px-3 text-sm text-white">Save</button><button type="button" onClick={() => setEditing(false)} className="text-sm">Cancel</button></div><Result state={updateState}/></form>;
  return <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><div><span className="font-medium">{head.name}</span><span className="ml-2 font-mono text-xs text-[color:var(--color-muted)]">{head.code}</span><span className="ml-2 text-xs text-[color:var(--color-muted)]">{head.category}{head.taxRatePct ? ` · ${head.taxRatePct}% tax` : ""}</span></div><div className="flex gap-2"><button onClick={() => setEditing(true)} className="text-brand-700">Edit</button><form action={deleteAction}><input type="hidden" name="feeHeadId" value={head.id}/><button disabled={deleting} className="text-red-700">Delete unused</button></form></div><Result state={deleteState}/></div>;
}

export function FeeStructureBuilder({ heads, campuses }: { heads: Head[]; campuses: Campus[] }) {
  const [state, action, pending] = useActionState(createFeeStructure, {});
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
  const [lines, setLines] = useState([{ feeHeadId: heads[0]?.id ?? "", amount: "" }]);
  const campus = campuses.find(c => c.id === campusId);
  return <form action={action} className="space-y-3 rounded border p-4"><h3 className="font-semibold">New class-wise fee structure</h3><div className="grid gap-3 sm:grid-cols-4"><input name="name" required placeholder="Grade 5 2026-27" className={input}/><select name="campusId" value={campusId} onChange={e => setCampusId(e.target.value)} className={input}>{campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select name="gradeLevelId" required className={input}><option value="">Class / grade</option>{campus?.grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select><select name="academicYearId" className={input}><option value="">Any academic session</option>{campus?.years.map(y => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div><div className="space-y-2">{lines.map((line, index) => <div className="flex gap-2" key={index}><select name="feeHeadId" value={line.feeHeadId} onChange={e => setLines(lines.map((l,i) => i === index ? {...l, feeHeadId:e.target.value} : l))} className={input}>{heads.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select><input name="amount" value={line.amount} onChange={e => setLines(lines.map((l,i) => i === index ? {...l, amount:e.target.value} : l))} type="number" min="0.01" step="0.01" placeholder="Amount" className={input}/>{lines.length > 1 && <button type="button" onClick={() => setLines(lines.filter((_,i) => i !== index))} className="text-red-700">Remove</button>}</div>)}</div><div className="flex gap-3"><button type="button" onClick={() => setLines([...lines, { feeHeadId: heads[0]?.id ?? "", amount: "" }])} disabled={!heads.length} className="text-sm text-brand-700">+ Add fee head</button><button disabled={pending || !heads.length} className="rounded bg-brand-600 px-4 py-2 text-sm text-white">{pending ? "Saving…" : "Create structure"}</button></div><Result state={state}/></form>;
}

export function StructureStatusButton({ id, active }: { id: string; active: boolean }) {
  const [state, action, pending] = useActionState(setFeeStructureActive, {});
  return <form action={action}><input type="hidden" name="feeStructureId" value={id}/><input type="hidden" name="active" value={String(!active)}/><button disabled={pending} className="text-sm text-brand-700">{active ? "Deactivate" : "Activate"}</button><Result state={state}/></form>;
}
