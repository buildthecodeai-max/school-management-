"use client";

import { useState } from "react";

interface CampusOption {
  id: string;
  name: string;
  structures: { id: string; name: string }[];
}

export function BillingForm({
  campuses,
  initial,
}: {
  campuses: CampusOption[];
  initial: { campusId?: string; structureId?: string; period?: string; due?: string };
}) {
  const [campusId, setCampusId] = useState(
    initial.campusId ?? campuses[0]?.id ?? "",
  );
  const structures = campuses.find((c) => c.id === campusId)?.structures ?? [];

  return (
    <form method="get" action="/portal/fees/billing" className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className={labelCls}>Campus</span>
        <select
          name="campusId"
          className={input}
          value={campusId}
          onChange={(e) => setCampusId(e.target.value)}
        >
          {campuses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>Fee structure</span>
        <select name="structureId" className={input} defaultValue={initial.structureId ?? ""}>
          <option value="">Select…</option>
          {structures.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={labelCls}>Period label</span>
        <input
          name="period"
          defaultValue={initial.period ?? "Term 1 · 2025–26"}
          className={input}
        />
      </label>

      <label className="block">
        <span className={labelCls}>Due date</span>
        <input name="due" type="date" defaultValue={initial.due ?? ""} className={input} />
      </label>

      <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
        Preview
      </button>
    </form>
  );
}

const input =
  "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const labelCls = "mb-1 block text-xs text-[color:var(--color-muted)]";
