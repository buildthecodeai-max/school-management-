"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createCampus,
  updateCampus,
  activateCampus,
  suspendCampus,
  closeCampus,
  type CampusActionState,
} from "./actions";

const inputCls =
  "w-full rounded-md border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

export function CreateCampusForm({ defaultTimezone }: { defaultTimezone: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<CampusActionState, FormData>(
    createCampus,
    {},
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <div className="mb-6">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          New campus
        </button>
        {state.message && (
          <p className="mt-2 text-sm text-green-700">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="mb-6 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5"
    >
      <h3 className="mb-4 font-semibold">New campus</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="campus-name">Name</label>
          <input id="campus-name" name="name" required placeholder="HMSS West" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="campus-code">Code</label>
          <input
            id="campus-code"
            name="code"
            required
            placeholder="WEST"
            maxLength={12}
            pattern="[A-Za-z0-9\-]+"
            className={`${inputCls} uppercase`}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="campus-city">City</label>
          <input id="campus-city" name="city" placeholder="Cambridge" className={inputCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="campus-tz">Timezone</label>
          <input id="campus-tz" name="timezone" defaultValue={defaultTimezone} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="campus-address">Address</label>
          <input id="campus-address" name="addressLine" placeholder="120 Elm Street" className={inputCls} />
        </div>
      </div>

      {state.error && (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create campus"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[color:var(--color-line)] px-4 py-2 text-sm font-medium hover:bg-[color:var(--color-surface2)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function EditCampusForm({
  campus,
}: {
  campus: { id: string; name: string; city: string | null; addressLine: string | null; logoUrl: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(campus.logoUrl ?? "");
  const [state, formAction, pending] = useActionState<CampusActionState, FormData>(
    updateCampus,
    {},
  );

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2 MB.");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-[color:var(--color-line)] px-3 py-1 text-xs font-medium hover:bg-[color:var(--color-surface2)]"
      >
        Edit
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface2)] p-4 space-y-3"
    >
      <input type="hidden" name="campusId" value={campus.id} />
      {/* hidden field carries the base64 data URI (or existing URL) */}
      <input type="hidden" name="logoUrl" value={preview} />
      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Edit campus</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Campus name *</label>
          <input name="name" required defaultValue={campus.name} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>City</label>
          <input name="city" defaultValue={campus.city ?? ""} placeholder="Lahore" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Address</label>
          <input name="addressLine" defaultValue={campus.addressLine ?? ""} placeholder="120 Elm Street" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Campus logo</label>
          <div className="flex items-center gap-4">
            {/* Preview / placeholder */}
            <div className="h-16 w-16 flex-shrink-0 rounded-lg border border-[color:var(--color-line)] bg-white flex items-center justify-center overflow-hidden">
              {preview ? (
                <img
                  src={preview}
                  alt="Logo preview"
                  className="h-full w-full object-contain p-1"
                  onError={() => setPreview("")}
                />
              ) : (
                <span className="text-xs text-[color:var(--color-muted)]">No logo</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer rounded-md border border-[color:var(--color-line)] bg-white px-3 py-1.5 text-xs font-medium hover:bg-[color:var(--color-surface2)] inline-block">
                {preview ? "Change image" : "Upload image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  className="sr-only"
                  onChange={handleFile}
                />
              </label>
              {preview && (
                <button
                  type="button"
                  onClick={() => setPreview("")}
                  className="text-xs text-red-600 hover:underline text-left"
                >
                  Remove logo
                </button>
              )}
              <p className="text-xs text-[color:var(--color-muted)]">PNG, JPG, SVG · max 2 MB</p>
            </div>
          </div>
        </div>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
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

const actionsByKind = {
  activate: activateCampus,
  suspend: suspendCampus,
  close: closeCampus,
} as const;

export function LifecycleButton({
  campusId,
  kind,
  label,
}: {
  campusId: string;
  kind: keyof typeof actionsByKind;
  label: string;
}) {
  const [state, formAction, pending] = useActionState<CampusActionState, FormData>(
    actionsByKind[kind],
    {},
  );

  const tone =
    kind === "activate"
      ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
      : kind === "suspend"
        ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
        : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100";

  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="campusId" value={campusId} />
      <button
        type="submit"
        disabled={pending}
        className={`rounded border px-3 py-1 text-xs font-medium disabled:opacity-50 ${tone}`}
      >
        {pending ? "…" : label}
      </button>
      {state.error && (
        <span className="ml-2 text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
