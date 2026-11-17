"use client";

import { useActionState, useState } from "react";
import { addBook, returnBookByBarcode, type LibraryActionState } from "./actions";

const inputCls = "w-full rounded-md border border-[color:var(--color-line)] bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]";

export function AddBookForm({
  campusId,
  categories,
}: {
  campusId: string;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<LibraryActionState, FormData>(addBook, {});

  if (!open) {
    return (
      <div>
        <button
          onClick={() => setOpen(true)}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          + Add book
        </button>
        {state.message && <p className="mt-2 text-sm text-green-700">{state.message}</p>}
      </div>
    );
  }

  return (
    <form action={action} className="rounded-lg border border-[color:var(--color-line)] bg-white p-4 space-y-3">
      <input type="hidden" name="campusId" value={campusId} />
      <h3 className="font-semibold text-sm">Add new book</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Title *</label>
          <input name="title" required placeholder="e.g. Elements of Mathematics" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Author</label>
          <input name="authorName" placeholder="e.g. Dr. Abdul Qadeer" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Category *</label>
          <select name="categoryId" required className={inputCls}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>ISBN</label>
          <input name="isbn" placeholder="978-..." className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Number of copies</label>
          <input name="copies" type="number" min="1" max="10" defaultValue="1" className={inputCls} />
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
          {pending ? "Adding…" : "Add book"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[color:var(--color-line)] px-4 py-1.5 text-sm font-medium hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ReturnBookForm({ campusId }: { campusId: string }) {
  const [state, action, pending] = useActionState<LibraryActionState, FormData>(returnBookByBarcode, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="campusId" value={campusId} />
      <div className="flex-1 min-w-48">
        <label className={labelCls}>Return by barcode</label>
        <input name="barcode" required placeholder="Scan barcode…" className={inputCls} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-[color:var(--color-line)] bg-white px-4 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "…" : "Return book"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      {state.message && <p className="w-full text-sm text-green-700">{state.message}</p>}
    </form>
  );
}
