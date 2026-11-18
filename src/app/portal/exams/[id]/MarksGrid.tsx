"use client";

import { useState, useActionState } from "react";
import { saveMarks, type ExamActionState } from "../actions";

interface Subject {
  id: string;
  name: string;
}
interface Component {
  id: string;
  name: string;
  maxMarks: number;
  weight: number;
}
interface Student {
  id: string;
  name: string;
  roll: number | null;
}
interface Cell {
  value: string;
  status: "NORMAL" | "ABSENT" | "EXEMPT";
}

export function MarksGrid({
  planId,
  editable,
  subjects,
  components,
  students,
  initial,
}: {
  planId: string;
  editable: boolean;
  subjects: Subject[];
  components: Component[];
  students: Student[];
  // keyed `${subjectId}:${studentId}:${componentId}`
  initial: Record<string, Cell>;
}) {
  const [activeSubject, setActiveSubject] = useState(subjects[0]?.id ?? "");
  const [cells, setCells] = useState<Record<string, Cell>>(initial);
  const [state, formAction, pending] = useActionState(saveMarks, {} as ExamActionState);

  function key(subjectId: string, studentId: string, componentId: string) {
    return `${subjectId}:${studentId}:${componentId}`;
  }
  function get(studentId: string, componentId: string): Cell {
    return cells[key(activeSubject, studentId, componentId)] ?? { value: "", status: "NORMAL" };
  }
  function update(studentId: string, componentId: string, patch: Partial<Cell>) {
    if (!editable) return;
    setCells((c) => {
      const k = key(activeSubject, studentId, componentId);
      return { ...c, [k]: { ...(c[k] ?? { value: "", status: "NORMAL" }), ...patch } };
    });
  }

  const entries = students.flatMap((s) =>
    components.map((comp) => {
      const cell = get(s.id, comp.id);
      return {
        studentId: s.id,
        componentId: comp.id,
        marks: cell.status === "NORMAL" ? cell.value : "",
        status: cell.status,
      };
    }),
  );

  if (subjects.length === 0) {
    return <p className="text-sm text-[color:var(--color-muted)]">No subjects configured for this plan.</p>;
  }

  return (
    <div>
      {/* subject tabs */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSubject(s.id)}
            className={`rounded-full px-3 py-1 text-sm ${
              activeSubject === s.id
                ? "bg-brand-600 text-white"
                : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <form action={formAction}>
        <input type="hidden" name="planId" value={planId} />
        <input type="hidden" name="subjectId" value={activeSubject} />
        <input type="hidden" name="entries" value={JSON.stringify(entries)} />

        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-line)] text-left text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
                <th className="px-4 py-3 font-medium">Student</th>
                {components.map((c) => (
                  <th key={c.id} className="px-4 py-3 font-medium">
                    {c.name}
                    <span className="ml-1 font-normal normal-case text-slate-400">
                      /{c.maxMarks} · {c.weight}%
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b border-[color:var(--color-line)] last:border-0">
                  <td className="px-4 py-2">
                    <span className="text-[color:var(--color-muted)]">{s.roll ?? "—"}</span>{" "}
                    <span className="font-medium">{s.name}</span>
                  </td>
                  {components.map((c) => {
                    const cell = get(s.id, c.id);
                    return (
                      <td key={c.id} className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={c.maxMarks}
                            step="0.5"
                            disabled={!editable || cell.status !== "NORMAL"}
                            value={cell.status === "NORMAL" ? cell.value : ""}
                            onChange={(e) => update(s.id, c.id, { value: e.target.value })}
                            className="w-16 rounded border border-[color:var(--color-line)] px-2 py-1 text-sm outline-none focus:border-brand-500 disabled:bg-slate-50"
                          />
                          <select
                            disabled={!editable}
                            value={cell.status}
                            onChange={(e) => update(s.id, c.id, { status: e.target.value as Cell["status"] })}
                            className="rounded border border-[color:var(--color-line)] px-1 py-1 text-xs outline-none"
                          >
                            <option value="NORMAL">#</option>
                            <option value="ABSENT">Ab</option>
                            <option value="EXEMPT">Ex</option>
                          </select>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {state.error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">{state.error}</p>
        )}
        {state.ok && state.message && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 ring-1 ring-inset ring-green-200">{state.message}</p>
        )}

        {editable && (
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              name="submit"
              value="save"
              disabled={pending}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"
            >
              Save marks
            </button>
            <button
              type="submit"
              name="submit"
              value="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Save &amp; submit for approval
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
