"use client";

import { useActionState, useState } from "react";
import { recordTrip, type TransportActionState } from "../actions";
import { inputCls, labelCls } from "@/components/ActionForm";

export function TripForm({ routeId, today, students }: { routeId: string; today: string; students: { id: string; name: string; admissionNumber: string }[] }) {
  const [state, action, pending] = useActionState(recordTrip, {} as TransportActionState);
  const [status, setStatus] = useState<Record<string, string>>(() => Object.fromEntries(students.map((s) => [s.id, "BOARDED"])));
  const records = JSON.stringify(students.map((s) => ({ studentId: s.id, status: status[s.id] })));
  return (
    <form action={action} className="card space-y-4 p-5">
      <input type="hidden" name="routeId" value={routeId} />
      <input type="hidden" name="records" value={records} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className={labelCls}>Date</span><input type="date" name="tripDate" defaultValue={today} max={today} required className={inputCls} /></label>
        <label><span className={labelCls}>Trip</span>
          <select name="direction" className={inputCls}><option value="MORNING">Morning (to school)</option><option value="AFTERNOON">Afternoon (home)</option><option value="OTHER">Other</option></select></label>
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-[color:var(--color-line)]">
          {students.map((s) => (
            <tr key={s.id}>
              <td className="py-2">{s.name} <span className="text-xs text-[color:var(--color-muted)]">{s.admissionNumber}</span></td>
              <td className="py-2 text-right">
                <select value={status[s.id]} onChange={(e) => setStatus((m) => ({ ...m, [s.id]: e.target.value }))} className="rounded border border-[color:var(--color-line)] px-2 py-1">
                  <option value="BOARDED">Boarded</option><option value="LATE">Late</option><option value="ABSENT">Absent</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>}
      {state.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-inset ring-green-200">{state.message}</p>}
      <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">{pending ? "Saving…" : "Record trip"}</button>
    </form>
  );
}
