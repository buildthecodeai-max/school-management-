"use client";

import { useActionState, useState } from "react";
import { importBankStatement, type BankActionState } from "../bank-actions";
import { inputCls, labelCls } from "@/components/ActionForm";

// Reads the chosen CSV in the browser and posts its text; nothing is stored until the server accepts every line.
export function ImportForm({ campusId }: { campusId: string }) {
  const [state, action, pending] = useActionState(importBankStatement, {} as BankActionState);
  const [csv, setCsv] = useState("");
  const [name, setName] = useState("");
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="campusId" value={campusId} />
      <input type="hidden" name="csv" value={csv} />
      <label className="block">
        <span className={labelCls}>Statement file (CSV)</span>
        <input type="file" accept=".csv,text/csv" className={inputCls} onChange={async (e) => { const f = e.target.files?.[0]; setName(f?.name ?? ""); setCsv(f ? await f.text() : ""); }} />
      </label>
      <p className="text-xs text-[color:var(--color-muted)]">Needs a header row with <b>date</b> (yyyy-mm-dd) and <b>amount</b>; optional <b>reference</b>, <b>description</b>, <b>currency</b>. Credits are positive. Importing the same file twice adds nothing.</p>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-inset ring-green-200">{state.message}</p>}
      <button disabled={pending || !csv} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{pending ? "Importing…" : name ? `Import ${name}` : "Import statement"}</button>
    </form>
  );
}
