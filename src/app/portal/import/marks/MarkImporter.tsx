"use client";

import { useState, useTransition } from "react";
import { previewMarkImport, commitMarkImport, type MarkImportRow, type MarkImportPreview } from "./actions";

function parseCsv(text: string): MarkImportRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const KEY_MAP: Record<string, keyof MarkImportRow> = {
    admissionnumber: "admissionNumber",
    admno: "admissionNumber",
    subject: "subject",
    component: "component",
    marks: "marks",
    score: "marks",
    status: "status",
  };
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: MarkImportRow = {};
    headers.forEach((h, i) => {
      const key = KEY_MAP[h];
      if (key) (row as Record<string, string>)[key] = vals[i] ?? "";
    });
    return row;
  });
}

export function MarkImporter({ planId, planName }: { planId: string; planName: string }) {
  const [preview, setPreview] = useState<MarkImportPreview | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MarkImportRow[]>([]);
  const [isPending, startTransition] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCsv(ev.target?.result as string);
      setRows(parsed);
      setPreview(null);
      setCommitted(null);
      setError(null);
    };
    reader.readAsText(file);
  }

  function handlePreview() {
    startTransition(async () => {
      const result = await previewMarkImport(planId, rows);
      setPreview(result);
      setCommitted(null);
      if (result.error) setError(result.error);
    });
  }

  function handleCommit() {
    startTransition(async () => {
      const result = await commitMarkImport(planId, rows);
      if (result.ok) {
        setCommitted(result.committed);
        setError(null);
        setPreview(null);
      } else {
        setError(result.error ?? "Import failed.");
      }
    });
  }

  const thCls = "pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";
  const tdCls = "py-1.5 pr-3 text-sm";

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
        <h2 className="mb-1 font-semibold">Plan: {planName}</h2>
        <p className="mb-4 text-sm text-[color:var(--color-muted)]">
          CSV columns: <code>admissionNumber, subject, component, marks, status</code> (status: NORMAL / ABSENT / EXEMPT)
        </p>
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="text-sm" />
        {rows.length > 0 && (
          <p className="mt-2 text-sm text-[color:var(--color-muted)]">{rows.length} row{rows.length !== 1 ? "s" : ""} parsed.</p>
        )}
        <div className="mt-4 flex gap-3">
          <button
            onClick={handlePreview}
            disabled={!rows.length || isPending}
            className="rounded-lg border border-[color:var(--color-line)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            {isPending ? "Working…" : "Preview"}
          </button>
          {preview && preview.summary.valid > 0 && (
            <button
              onClick={handleCommit}
              disabled={isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
            >
              Commit {preview.summary.valid} valid row{preview.summary.valid !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">{error}</div>
      )}

      {committed !== null && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 ring-1 ring-inset ring-green-200">
          ✓ {committed} mark entr{committed !== 1 ? "ies" : "y"} imported successfully.
        </div>
      )}

      {preview && (
        <div className="rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
          <div className="mb-3 flex items-center gap-4 text-sm">
            <span className="text-[color:var(--color-muted)]">Total: <strong>{preview.summary.total}</strong></span>
            <span className="text-green-700">Valid: <strong>{preview.summary.valid}</strong></span>
            <span className="text-red-700">Invalid: <strong>{preview.summary.invalid}</strong></span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[color:var(--color-surface)]">
                <tr>
                  <th className={thCls}>#</th>
                  <th className={thCls}>Adm no.</th>
                  <th className={thCls}>Subject</th>
                  <th className={thCls}>Component</th>
                  <th className={thCls}>Marks</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {preview.rows.map((r) => (
                  <tr key={r.index} className={r.errors.length ? "bg-red-50" : ""}>
                    <td className={tdCls + " text-[color:var(--color-muted)]"}>{r.index + 1}</td>
                    <td className={tdCls}>{r.data.admissionNumber}</td>
                    <td className={tdCls}>{r.data.subject}</td>
                    <td className={tdCls}>{r.data.component}</td>
                    <td className={tdCls}>{r.data.marks ?? "—"}</td>
                    <td className={tdCls}>{r.data.status || "NORMAL"}</td>
                    <td className="py-1.5 text-xs text-red-600">{r.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
