"use client";

import { useActionState, useState } from "react";
import {
  addApplicant,
  createOpening,
  hireApplicant,
  moveApplicant,
  rateApplicant,
  setOpeningStatus,
  type RecruitState,
} from "./actions";

const input = "w-full rounded-md border border-[color:var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";
const primary = "rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50";
const ghost = "rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-sm font-medium hover:bg-slate-50";

function Result({ state }: { state: RecruitState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-600">{state.error}</p>;
  if (state.message) return <p role="status" className="text-sm text-green-700">{state.message}</p>;
  return null;
}

export function NewOpeningForm({
  campusId,
  positions,
}: {
  campusId: string;
  positions: { id: string; title: string; departmentName: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RecruitState, FormData>(createOpening, {});

  if (!open) {
    return (
      <div>
        <button onClick={() => setOpen(true)} className={primary}>+ New opening</button>
        <Result state={state} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-lg border border-[color:var(--color-line)] bg-white p-4">
      <input type="hidden" name="campusId" value={campusId} />
      <h3 className="text-sm font-semibold">New job opening</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Title *</label>
          <input name="title" required placeholder="Grade 4 Mathematics Teacher" className={input} />
        </div>
        <div>
          <label className={label}>Position</label>
          <select name="positionId" className={input} defaultValue="">
            <option value="">Not linked</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>{p.title} ({p.departmentName})</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Vacancies *</label>
          <input name="headcount" type="number" min={1} max={50} defaultValue={1} required className={input} />
        </div>
        <div>
          <label className={label}>Closing date</label>
          <input name="closesAt" type="date" className={input} />
        </div>
      </div>
      <div>
        <label className={label}>Description</label>
        <textarea name="description" rows={3} className={input} />
      </div>
      <Result state={state} />
      <div className="flex gap-2">
        <button disabled={pending} className={primary}>{pending ? "Saving…" : "Create opening"}</button>
        <button type="button" onClick={() => setOpen(false)} className={ghost}>Close</button>
      </div>
    </form>
  );
}

export function OpeningStatusControl({ openingId, status }: { openingId: string; status: string }) {
  const [state, action, pending] = useActionState<RecruitState, FormData>(setOpeningStatus, {});
  const options = ["OPEN", "ON_HOLD", "CLOSED", "FILLED"].filter((s) => s !== status);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="openingId" value={openingId} />
      <select name="status" className={`${input} !w-auto`} defaultValue={options[0]}>
        {options.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
      </select>
      <button disabled={pending} className={ghost}>Update status</button>
      <Result state={state} />
    </form>
  );
}

export function AddApplicantForm({ openingId }: { openingId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<RecruitState, FormData>(addApplicant, {});

  if (!open) {
    return (
      <div>
        <button onClick={() => setOpen(true)} className={primary}>+ Add applicant</button>
        <Result state={state} />
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3 rounded-lg border border-[color:var(--color-line)] bg-white p-4">
      <input type="hidden" name="openingId" value={openingId} />
      <h3 className="text-sm font-semibold">Add applicant</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div><label className={label}>First name *</label><input name="firstName" required className={input} /></div>
        <div><label className={label}>Last name *</label><input name="lastName" required className={input} /></div>
        <div><label className={label}>Email *</label><input name="email" type="email" required className={input} /></div>
        <div><label className={label}>Phone</label><input name="phone" className={input} /></div>
        <div><label className={label}>Source</label><input name="source" placeholder="Referral, job board…" className={input} /></div>
      </div>
      <div>
        <label className={label}>Notes</label>
        <textarea name="coverNote" rows={3} className={input} />
      </div>
      <Result state={state} />
      <div className="flex gap-2">
        <button disabled={pending} className={primary}>{pending ? "Saving…" : "Add applicant"}</button>
        <button type="button" onClick={() => setOpen(false)} className={ghost}>Close</button>
      </div>
    </form>
  );
}

const MOVE_TARGETS = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"];

export function ApplicantControls({
  applicantId,
  stage,
  rating,
  canHire,
  positions,
  defaultPositionId,
}: {
  applicantId: string;
  stage: string;
  rating: number | null;
  canHire: boolean;
  positions: { id: string; title: string; departmentName: string }[];
  defaultPositionId: string | null;
}) {
  const [moveState, moveAction, moving] = useActionState<RecruitState, FormData>(moveApplicant, {});
  const [rateState, rateAction] = useActionState<RecruitState, FormData>(rateApplicant, {});
  const [hireState, hireAction, hiring] = useActionState<RecruitState, FormData>(hireApplicant, {});
  const [hireOpen, setHireOpen] = useState(false);
  const closed = ["HIRED", "REJECTED", "WITHDRAWN"].includes(stage);

  return (
    <div className="mt-2 space-y-2">
      {!closed && (
        <form action={rateAction} className="flex items-center gap-2 text-xs">
          <input type="hidden" name="applicantId" value={applicantId} />
          <label htmlFor={`rating-${applicantId}`} className="text-[color:var(--color-muted)]">Rating</label>
          <select
            key={rating ?? "none"}
            id={`rating-${applicantId}`}
            name="rating"
            defaultValue={rating ?? ""}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="rounded border border-[color:var(--color-line)] px-1.5 py-0.5"
          >
            <option value="" disabled>—</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
          </select>
          {rateState.error && <span className="text-red-600">{rateState.error}</span>}
        </form>
      )}

      {!closed && (
        <form action={moveAction} className="space-y-1.5">
          <input type="hidden" name="applicantId" value={applicantId} />
          <div className="flex gap-1.5">
            <select name="toStage" defaultValue="" aria-label="Move to stage" className="min-w-0 flex-1 rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs">
              <option value="" disabled>Move to…</option>
              {MOVE_TARGETS.filter((s) => s !== stage).map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
            <button disabled={moving} className="rounded border border-[color:var(--color-line)] px-2 py-1 text-xs font-medium hover:bg-slate-50">Move</button>
          </div>
          <input name="note" placeholder="Note (optional)" className="w-full rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs" />
          <Result state={moveState} />
        </form>
      )}

      {stage === "OFFER" && canHire && !hireOpen && (
        <button onClick={() => setHireOpen(true)} className="w-full rounded bg-green-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
          Hire…
        </button>
      )}
      {stage === "OFFER" && canHire && hireOpen && (
        <form action={hireAction} className="space-y-2 rounded border border-green-200 bg-green-50 p-2">
          <input type="hidden" name="applicantId" value={applicantId} />
          <p className="text-xs font-semibold text-green-800">Hire and create staff record</p>
          <input name="employeeNumber" required placeholder="Employee number" className="w-full rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs" />
          <select name="positionId" required defaultValue={defaultPositionId ?? ""} aria-label="Position" className="w-full rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs">
            <option value="" disabled>Position…</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.departmentName})</option>)}
          </select>
          <select name="contractType" aria-label="Contract type" className="w-full rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs">
            <option value="PERMANENT">Permanent</option>
            <option value="TEMPORARY">Temporary</option>
            <option value="PART_TIME">Part-time</option>
            <option value="CONTRACT">Contract</option>
          </select>
          <input name="salary" type="number" min="0" step="0.01" placeholder="Monthly salary" className="w-full rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs" />
          <input name="startDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} aria-label="Start date" className="w-full rounded border border-[color:var(--color-line)] px-1.5 py-1 text-xs" />
          <Result state={hireState} />
          <div className="flex gap-1.5">
            <button disabled={hiring} className="flex-1 rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">{hiring ? "Hiring…" : "Confirm hire"}</button>
            <button type="button" onClick={() => setHireOpen(false)} className="rounded border border-[color:var(--color-line)] bg-white px-2 py-1 text-xs">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
