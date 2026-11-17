"use client";

import { useRef } from "react";

// Submits on change so switching campus is one interaction. The route
// re-validates the choice server-side; this control only narrows what the
// user can pick to what they already hold.
export function CampusSwitcher({
  campuses,
  current,
  allowOrgWide,
}: {
  campuses: { id: string; name: string }[];
  current: string | null;
  allowOrgWide: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (campuses.length === 0) return null;

  return (
    <form ref={formRef} action="/portal/campus-switch" method="post">
      <label htmlFor="campus-switch" className="sr-only">
        Active campus
      </label>
      <select
        id="campus-switch"
        name="campusId"
        defaultValue={current ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-md border border-[color:var(--color-line)] bg-white px-2 py-1 text-xs text-slate-600 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      >
        {allowOrgWide && <option value="">All campuses</option>}
        {campuses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <noscript>
        <button className="ml-1 rounded border px-2 py-1 text-xs">Switch</button>
      </noscript>
    </form>
  );
}
