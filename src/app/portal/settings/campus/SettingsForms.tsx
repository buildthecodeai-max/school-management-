"use client";

import { useActionState } from "react";
import { saveOrgSetting, saveCampusSetting, type SettingActionState } from "./actions";
import type { EffectiveSetting } from "@/lib/settings";

const inputCls =
  "w-40 rounded-md border border-[color:var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-[color:var(--color-muted)]";

function SourceBadge({ source }: { source: EffectiveSetting["source"] }) {
  const map = {
    campus: "bg-brand-50 text-brand-700 border-brand-200",
    organization: "bg-amber-50 text-amber-700 border-amber-200",
    default: "bg-slate-100 text-slate-500 border-slate-200",
  } as const;
  const label = { campus: "Campus override", organization: "From organization", default: "Default" }[source];
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${map[source]}`}>{label}</span>;
}

export function OrgSettingRow({ s }: { s: EffectiveSetting }) {
  const [state, action, pending] = useActionState<SettingActionState, FormData>(saveOrgSetting, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 border-b border-[color:var(--color-line)] py-2.5 last:border-0">
      <input type="hidden" name="key" value={s.key} />
      <div className="min-w-[220px] flex-1">
        <p className="text-sm font-medium">{s.def.label}</p>
        <p className="text-xs text-[color:var(--color-muted)]">{s.def.description}</p>
      </div>
      <input
        name="value"
        defaultValue={s.orgValue ?? ""}
        placeholder={`default: ${s.def.default || "—"}`}
        className={inputCls}
      />
      <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
        <input type="checkbox" name="locked" defaultChecked={s.locked} className="rounded" />
        Lock (no campus override)
      </label>
      <button
        disabled={pending}
        className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
      {state.message && <span className="w-full text-xs text-green-700">{state.message}</span>}
    </form>
  );
}

export function CampusSettingRow({
  s,
  campusId,
  canWrite,
}: {
  s: EffectiveSetting;
  campusId: string;
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState<SettingActionState, FormData>(saveCampusSetting, {});
  const disabled = !canWrite || s.locked;
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 border-b border-[color:var(--color-line)] py-2.5 last:border-0">
      <input type="hidden" name="key" value={s.key} />
      <input type="hidden" name="campusId" value={campusId} />
      <div className="min-w-[200px] flex-1">
        <p className="text-sm font-medium">{s.def.label}</p>
        <p className="text-xs text-[color:var(--color-muted)]">{s.def.description}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm tabular-nums">{s.value || "—"}</span>
        <SourceBadge source={s.source} />
      </div>
      <input
        name="value"
        defaultValue={s.campusValue ?? ""}
        disabled={disabled}
        placeholder={s.locked ? "locked" : `inherits: ${s.source === "organization" ? s.orgValue : s.def.default}`}
        className={inputCls}
      />
      <button
        disabled={disabled || pending}
        className="rounded-md border border-[color:var(--color-line)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "…" : s.campusValue !== null ? "Update" : "Override"}
      </button>
      {state.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
      {state.message && <span className="w-full text-xs text-green-700">{state.message}</span>}
    </form>
  );
}
