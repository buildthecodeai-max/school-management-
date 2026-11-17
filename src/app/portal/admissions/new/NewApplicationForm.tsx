"use client";

import { useState } from "react";
import { createApplication } from "../actions";

interface CampusOption {
  id: string;
  name: string;
  grades: { id: string; name: string }[];
}

export function NewApplicationForm({ campuses }: { campuses: CampusOption[] }) {
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
  const grades = campuses.find((c) => c.id === campusId)?.grades ?? [];

  return (
    <form action={createApplication} className="space-y-6">
      {/* Applicant */}
      <section className="card p-5">
        <h3 className="mb-4 font-semibold">Applicant</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" required>
            <input name="firstName" required className={input} />
          </Field>
          <Field label="Last name" required>
            <input name="lastName" required className={input} />
          </Field>
          <Field label="Date of birth">
            <input name="dateOfBirth" type="date" className={input} />
          </Field>
          <Field label="Gender">
            <select name="gender" className={input} defaultValue="UNDISCLOSED">
              <option value="UNDISCLOSED">Prefer not to say</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Applicant email">
            <input name="applicantEmail" type="email" className={input} />
          </Field>
          <Field label="Applicant phone">
            <input name="applicantPhone" className={input} />
          </Field>
        </div>
      </section>

      {/* Placement */}
      <section className="card p-5">
        <h3 className="mb-4 font-semibold">Placement</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Campus" required>
            <select
              name="campusId"
              required
              className={input}
              value={campusId}
              onChange={(e) => setCampusId(e.target.value)}
            >
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target grade">
            <select name="gradeLevelId" className={input} defaultValue="">
              <option value="">To be decided</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source" required>
            <select name="source" required className={input} defaultValue="WALK_IN">
              <option value="WALK_IN">Walk-in</option>
              <option value="WEBSITE">Website</option>
              <option value="REFERRAL">Referral</option>
              <option value="STAFF">Staff entry</option>
              <option value="API">API</option>
            </select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Prior school">
            <input name="priorSchool" className={input} />
          </Field>
        </div>
      </section>

      {/* Guardian */}
      <section className="card p-5">
        <h3 className="mb-4 font-semibold">Guardian / household</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Guardian name">
            <input name="guardianName" className={input} />
          </Field>
          <Field label="Relationship">
            <select name="guardianRelationship" className={input} defaultValue="GUARDIAN">
              <option value="MOTHER">Mother</option>
              <option value="FATHER">Father</option>
              <option value="GUARDIAN">Guardian</option>
              <option value="GRANDPARENT">Grandparent</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Guardian email">
            <input name="guardianEmail" type="email" className={input} />
          </Field>
          <Field label="Guardian phone">
            <input name="guardianPhone" className={input} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notes">
            <textarea name="notes" rows={2} className={input + " w-full"} />
          </Field>
        </div>
      </section>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Create application
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

const input =
  "w-full rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";
