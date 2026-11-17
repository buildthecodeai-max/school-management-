"use client";

import { useActionState, useState } from "react";
import { addStaff, type HrActionState } from "./actions";

const inputCls = "w-full rounded-md border border-[color:var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

export interface Position {
  id: string;
  title: string;
  departmentName: string;
}

export function AddStaffForm({
  campusId,
  positions,
}: {
  campusId: string;
  positions: Position[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<HrActionState, FormData>(addStaff, {});

  if (!open) {
    return (
      <div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Add staff member
        </button>
        {state.message && <p className="mt-2 text-sm text-green-700">{state.message}</p>}
      </div>
    );
  }

  return (
    <form
      action={action}
      className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface2)] p-4 space-y-3"
    >
      <input type="hidden" name="campusId" value={campusId} />
      <h3 className="font-semibold text-sm">Add staff member</h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={labelCls}>First name *</label>
          <input name="firstName" required placeholder="Zahid" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Last name *</label>
          <input name="lastName" required placeholder="Mehmood" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input name="email" type="email" placeholder="zahid@school.edu" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Gender *</label>
          <select name="gender" required className={inputCls}>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Employee number *</label>
          <input name="employeeNumber" required placeholder="EMP-0010" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Position *</label>
          <select name="positionId" required className={inputCls}>
            <option value="">Choose…</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.departmentName})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Contract type *</label>
          <select name="contractType" required className={inputCls}>
            <option value="PERMANENT">Permanent</option>
            <option value="TEMPORARY">Temporary</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Monthly salary (cents)</label>
          <input name="salary" type="number" min="0" defaultValue="0" className={inputCls} />
          <p className="mt-0.5 text-xs text-[color:var(--color-muted)]">Enter in smallest currency unit (e.g. 500000 = $5,000)</p>
        </div>
        <div>
          <label className={labelCls}>Start date *</label>
          <input name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputCls} />
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add staff"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[color:var(--color-line)] px-4 py-1.5 text-sm font-medium hover:bg-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
