"use client";

import { useState, useMemo, useActionState } from "react";
import {
  previewImport,
  commitImport,
  type ImportPreview,
  type ImportRow,
  type CommitResult,
} from "./actions";

const FIELDS: { key: keyof ImportRow; label: string; required?: boolean; syn: string[] }[] = [
  { key: "firstName", label: "First name", required: true, syn: ["firstname", "first", "givenname", "fname"] },
  { key: "lastName", label: "Last name", required: true, syn: ["lastname", "last", "surname", "familyname", "lname"] },
  { key: "admissionNumber", label: "Admission no.", required: true, syn: ["admissionnumber", "admissionno", "admission", "admno", "admissionid"] },
  { key: "campus", label: "Campus", required: true, syn: ["campus", "campuscode", "campusname", "branch"] },
  { key: "grade", label: "Grade", required: true, syn: ["grade", "gradelevel", "class", "year"] },
  { key: "section", label: "Section", required: true, syn: ["section", "sectionname", "division"] },
  { key: "gender", label: "Gender", syn: ["gender", "sex"] },
  { key: "dateOfBirth", label: "Date of birth", syn: ["dateofbirth", "dob", "birthdate"] },
  { key: "guardianName", label: "Guardian name", syn: ["guardianname", "guardian", "parentname", "parent"] },
  { key: "guardianEmail", label: "Guardian email", syn: ["guardianemail", "parentemail", "email"] },
];

const SAMPLE = `firstName,lastName,admissionNumber,campus,grade,section,gender,dateOfBirth,guardianName,guardianEmail
Aria,Thompson,GA-5001,MAIN,Grade 1,Section A,FEMALE,2019-04-11,Mark Thompson,mark.thompson@example.com
Noah,Williams,GA-5002,MAIN,Grade 2,Section A,MALE,2018-09-02,Lisa Williams,lisa.w@example.com
Zoe,Martin,GA-5003,MAIN,Grade 3,Section A,FEMALE,2017-01-20,,
Ethan,Clark,GA-0001,MAIN,Grade 1,Section A,MALE,2019-06-15,,
Maya,Roberts,GA-5004,MAIN,Grade 9,Section A,FEMALE,2016-03-03,,`;

function normalize(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
        } else cur += ch;
      } else if (ch === ",") { out.push(cur); cur = ""; }
      else if (ch === '"') q = true;
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

const emptyPreview: ImportPreview = { rows: [], summary: { total: 0, valid: 0, invalid: 0 } };
const emptyCommit: CommitResult = {};

export function StudentImporter() {
  const [csv, setCsv] = useState("");
  const [parsed, setParsed] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [preview, previewAction] = useActionState(previewImport, emptyPreview);
  const [commit, commitAction, committing] = useActionState(commitImport, emptyCommit);

  function doParse(text: string) {
    const p = parseCSV(text);
    setParsed(p);
    const auto: Record<string, number> = {};
    for (const f of FIELDS) {
      const idx = p.headers.findIndex((h) => f.syn.includes(normalize(h)));
      auto[f.key] = idx;
    }
    setMapping(auto);
  }

  const mappedRows: ImportRow[] = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((row) => {
      const obj: ImportRow = {};
      for (const f of FIELDS) {
        const idx = mapping[f.key];
        if (idx != null && idx >= 0) obj[f.key] = row[idx] ?? "";
      }
      return obj;
    });
  }, [parsed, mapping]);

  const rowsJson = JSON.stringify(mappedRows);

  if (commit.done) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <p className="text-lg font-semibold text-green-800">Import complete</p>
        <p className="mt-1 text-sm text-green-700">
          Created <strong>{commit.created}</strong> students
          {commit.guardians ? ` and ${commit.guardians} guardians` : ""}.
          {commit.skipped ? ` ${commit.skipped} invalid row(s) were not imported.` : ""}
        </p>
        <a href="/portal/students" className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          View students
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Step 1: input */}
      <div className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">1 · Paste or upload CSV</h3>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setCsv(SAMPLE); doParse(SAMPLE); }} className={ghost}>
              Load sample
            </button>
            <label className={ghost + " cursor-pointer"}>
              Upload file
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  setCsv(text);
                  doParse(text);
                }}
              />
            </label>
          </div>
        </div>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          onBlur={() => csv && doParse(csv)}
          rows={5}
          placeholder="firstName,lastName,admissionNumber,campus,grade,section…"
          className="w-full rounded-lg border border-[color:var(--color-line)] p-3 font-mono text-xs outline-none focus:border-brand-500"
        />
        {!parsed && csv && (
          <button type="button" onClick={() => doParse(csv)} className={primary + " mt-2"}>Parse</button>
        )}
      </div>

      {/* Step 2: mapping */}
      {parsed && parsed.headers.length > 0 && (
        <div className="card p-5">
          <h3 className="mb-3 font-semibold">2 · Map columns · {parsed.rows.length} rows</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="block text-sm">
                <span className="mb-1 block text-xs text-[color:var(--color-muted)]">
                  {f.label}{f.required && <span className="text-red-500"> *</span>}
                </span>
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-[color:var(--color-line)] px-2 py-1.5 text-sm"
                >
                  <option value={-1}>— none —</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <form action={previewAction} className="mt-4">
            <input type="hidden" name="rows" value={rowsJson} />
            <button className={primary}>Validate &amp; preview</button>
          </form>
        </div>
      )}

      {/* Step 3: preview */}
      {preview.rows.length > 0 && (
        <div className="card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">3 · Preview</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-green-700 ring-1 ring-inset ring-green-200">{preview.summary.valid} valid</span>
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-red-700 ring-1 ring-inset ring-red-200">{preview.summary.invalid} invalid</span>
            </div>
          </div>
          {preview.error && <p className="mb-3 text-sm text-red-600">{preview.error}</p>}
          <div className="max-h-96 overflow-auto rounded-lg border border-[color:var(--color-line)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Admission</th>
                  <th className="px-3 py-2 font-medium">Placement</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.index} className={`border-t border-[color:var(--color-line)] ${r.errors.length ? "bg-red-50/40" : ""}`}>
                    <td className="px-3 py-2 text-[color:var(--color-muted)]">{r.index + 1}</td>
                    <td className="px-3 py-2">{r.data.firstName} {r.data.lastName}</td>
                    <td className="px-3 py-2">{r.data.admissionNumber}</td>
                    <td className="px-3 py-2 text-[color:var(--color-muted)]">{r.data.campus} · {r.data.grade} · {r.data.section}</td>
                    <td className="px-3 py-2">
                      {r.errors.length === 0 ? (
                        <span className="text-green-700">OK</span>
                      ) : (
                        <span className="text-red-600">{r.errors.join("; ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {commit.error && <p className="mt-3 text-sm text-red-600">{commit.error}</p>}

          {preview.summary.valid > 0 && (
            <form action={commitAction} className="mt-4">
              <input type="hidden" name="rows" value={rowsJson} />
              <button disabled={committing} className={primary}>
                {committing ? "Importing…" : `Import ${preview.summary.valid} valid row${preview.summary.valid === 1 ? "" : "s"}`}
              </button>
              {preview.summary.invalid > 0 && (
                <span className="ml-3 text-xs text-[color:var(--color-muted)]">
                  {preview.summary.invalid} invalid row(s) will be skipped — no partial commit of a row occurs.
                </span>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

const primary = "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60";
const ghost = "rounded-lg bg-white px-3 py-1.5 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50";
