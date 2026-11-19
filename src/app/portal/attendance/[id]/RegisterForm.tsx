"use client";

import { useState, useMemo } from "react";
import { useActionState } from "react";
import { saveAttendance, type AttendanceActionState } from "../actions";

interface Code {
  id: string;
  code: string;
  label: string;
  category: string;
}
interface StudentRow {
  id: string;
  roll: number | null;
  name: string;
  admissionNumber: string;
}

const catStyle: Record<string, string> = {
  PRESENT: "bg-green-600 text-white",
  ABSENT: "bg-red-600 text-white",
  LATE: "bg-amber-500 text-white",
  EXCUSED: "bg-sky-600 text-white",
  LEAVE: "bg-slate-500 text-white",
  REMOTE: "bg-indigo-600 text-white",
};

const initial: AttendanceActionState = {};

export function RegisterForm({
  sectionId,
  editable,
  codes,
  students,
  initialMarks,
  date,
  needsReason,
  leaveStudentIds = [],
}: {
  leaveStudentIds?: string[];
  date: string;
  needsReason: boolean;
  sectionId: string;
  editable: boolean;
  codes: Code[];
  students: StudentRow[];
  initialMarks: Record<string, string>;
}) {
  const presentCode = codes.find((c) => c.category === "PRESENT");
  const [marks, setMarks] = useState<Record<string, string>>(() => {
    // default everyone to Present when nothing recorded yet
    const base: Record<string, string> = { ...initialMarks };
    if (Object.keys(initialMarks).length === 0 && presentCode) {
      // Everyone starts Present, except students whose leave was approved for this day.
      const leaveCode = codes.find((c) => c.category === "LEAVE");
      students.forEach((s) => (base[s.id] = leaveCode && leaveStudentIds.includes(s.id) ? leaveCode.id : presentCode.id));
    }
    return base;
  });
  const [state, formAction, pending] = useActionState(saveAttendance, initial);

  const counts = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const s of students) {
      const codeId = marks[s.id];
      const code = codes.find((c) => c.id === codeId);
      const cat = code?.category ?? "—";
      byCat[cat] = (byCat[cat] ?? 0) + 1;
    }
    return byCat;
  }, [marks, students, codes]);

  function setMark(studentId: string, codeId: string) {
    if (!editable) return;
    setMarks((m) => ({ ...m, [studentId]: codeId }));
  }

  return (
    <div>
      {/* Summary + legend */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {codes.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-inset ring-[color:var(--color-line)]"
          >
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${catStyle[c.category] ?? "bg-slate-400 text-white"}`}
            >
              {c.code}
            </span>
            {c.label}
            <span className="font-semibold text-[color:var(--color-muted)]">
              {counts[c.category] ?? 0}
            </span>
          </span>
        ))}
      </div>

      <form action={formAction}>
        <input type="hidden" name="sectionId" value={sectionId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="marks" value={JSON.stringify(marks)} />

        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Mark</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-[color:var(--color-line)] last:border-0"
                >
                  <td className="px-4 py-2 text-[color:var(--color-muted)]">
                    {s.roll ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-[color:var(--color-muted)]">
                      {s.admissionNumber}
                    </p>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      {codes.map((c) => {
                        const active = marks[s.id] === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={!editable}
                            onClick={() => setMark(s.id, c.id)}
                            title={c.label}
                            className={`h-8 w-8 rounded text-xs font-bold transition ${
                              active
                                ? catStyle[c.category] ?? "bg-slate-500 text-white"
                                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            } ${!editable ? "cursor-not-allowed opacity-70" : ""}`}
                          >
                            {c.code}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {state.error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
            {state.error}
          </p>
        )}
        {state.ok && state.message && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-inset ring-green-200">
            {state.message}
          </p>
        )}

        {editable && needsReason && (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium">Reason for amending this submitted register</span>
            <input
              name="reason"
              required
              minLength={5}
              maxLength={500}
              placeholder="e.g. Parent confirmed child was present; marked absent in error"
              className="w-full rounded-lg border border-[color:var(--color-line)] px-3 py-2"
            />
          </label>
        )}

        {editable && (
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              name="submit"
              value="draft"
              disabled={pending}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50 disabled:opacity-60"
            >
              Save draft
            </button>
            <button
              type="submit"
              name="submit"
              value="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : needsReason ? "Save amendment" : "Submit register"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
