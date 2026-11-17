"use client";

import { useActionState, useState } from "react";
import { deleteCertificate, editCertificate, type CertActionState } from "./actions";

const CERT_LABELS: Record<string, string> = {
  BONAFIDE: "Bonafide",
  TRANSFER: "School Leaving",
  CHARACTER: "Character",
};

export function DeleteCertButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<CertActionState, FormData>(
    deleteCertificate,
    {},
  );
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="text-xs text-red-600 hover:underline"
      >
        Delete
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <span className="text-xs text-[color:var(--color-muted)]">Sure?</span>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
      >
        {pending ? "…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirm(false)}
        className="text-xs text-[color:var(--color-muted)] hover:underline"
      >
        Cancel
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}

export function EditCertButton({
  id,
  currentType,
}: {
  id: string;
  currentType: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CertActionState, FormData>(
    editCertificate,
    {},
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-[color:var(--color-muted)] hover:underline"
      >
        Edit
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex items-center gap-1 flex-wrap">
      <input type="hidden" name="id" value={id} />
      <select
        name="type"
        defaultValue={currentType}
        className="rounded border border-[color:var(--color-line)] px-1.5 py-0.5 text-xs"
      >
        {Object.entries(CERT_LABELS).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-brand-700 hover:underline disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-[color:var(--color-muted)] hover:underline"
      >
        Cancel
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
