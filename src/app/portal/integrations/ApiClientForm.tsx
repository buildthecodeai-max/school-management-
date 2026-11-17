"use client";

import { useActionState } from "react";
import { createApiClient, type CreateClientState } from "./actions";
import { API_SCOPES } from "@/lib/api-scopes";

const initial: CreateClientState = {};

export function ApiClientForm() {
  const [state, action, pending] = useActionState(createApiClient, initial);

  if (state.token) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-800">
          API credential created — copy it now, it won&apos;t be shown again
        </p>
        <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-xs ring-1 ring-inset ring-amber-200">
          {state.token}
        </code>
        <p className="mt-2 text-xs text-amber-700">
          Key id <code>{state.keyId}</code>. Send it as{" "}
          <code>Authorization: Bearer {"<token>"}</code>.
        </p>
        <a
          href="/portal/integrations"
          className="mt-3 inline-block rounded-lg bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
        >
          Done
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Client name</label>
        <input
          name="name"
          required
          placeholder="e.g. Nightly SIS sync"
          className="w-full max-w-sm rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>
      <div>
        <p className="mb-1 text-xs text-[color:var(--color-muted)]">Scopes</p>
        <div className="flex flex-wrap gap-3">
          {API_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name={`scope:${s}`} className="h-3.5 w-3.5" />
              <code className="text-xs">{s}</code>
            </label>
          ))}
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create API client"}
      </button>
    </form>
  );
}
