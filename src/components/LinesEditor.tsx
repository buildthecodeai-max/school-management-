"use client";

import { useActionState, useState } from "react";
import { inputCls, labelCls } from "@/components/ActionForm";

type Item = { id: string; label: string };
type Row = { itemId: string; qty: string; unitCost: string };
type State = { ok?: boolean; error?: string; message?: string };

/** A form of item/qty(/unit cost) rows submitted as one JSON `lines` field. */
export function LinesForm({
  action,
  items,
  withCost = false,
  hidden,
  extra,
  submit,
}: {
  action: (prev: State, f: FormData) => Promise<State>;
  items: Item[];
  withCost?: boolean;
  hidden: Record<string, string>;
  extra?: React.ReactNode;
  submit: string;
}) {
  const [state, dispatch, pending] = useActionState(action, {} as State);
  const [rows, setRows] = useState<Row[]>([{ itemId: items[0]?.id ?? "", qty: "1", unitCost: "" }]);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <form action={dispatch} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="lines" value={JSON.stringify(rows)} />
      {extra}
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1"><span className={labelCls}>Item</span>
            <select value={r.itemId} onChange={(e) => set(i, { itemId: e.target.value })} className={inputCls}>{items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}</select></label>
          <label className="w-24"><span className={labelCls}>Qty</span>
            <input type="number" min={1} value={r.qty} onChange={(e) => set(i, { qty: e.target.value })} className={inputCls} /></label>
          {withCost && (
            <label className="w-28"><span className={labelCls}>Unit cost</span>
              <input inputMode="decimal" placeholder="0.00" value={r.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} className={inputCls} /></label>
          )}
          {rows.length > 1 && <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="pb-2 text-sm text-red-700 hover:underline">Remove</button>}
        </div>
      ))}
      <button type="button" onClick={() => setRows((x) => [...x, { itemId: items[0]?.id ?? "", qty: "1", unitCost: "" }])} className="text-sm text-brand-700 hover:underline">+ Add line</button>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-inset ring-green-200">{state.message}</p>}
      <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{pending ? "Saving…" : submit}</button>
    </form>
  );
}
