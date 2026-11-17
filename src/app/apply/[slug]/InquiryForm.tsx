"use client";

import { useState } from "react";
import { useActionState } from "react";
import { submitInquiry, type InquiryState } from "./actions";

interface CampusOption {
  id: string;
  name: string;
  grades: { id: string; name: string }[];
}

const initial: InquiryState = {};

export function InquiryForm({
  slug,
  campuses,
}: {
  slug: string;
  campuses: CampusOption[];
}) {
  const [campusId, setCampusId] = useState(campuses[0]?.id ?? "");
  const [state, action, pending] = useActionState(submitInquiry, initial);
  const grades = campuses.find((c) => c.id === campusId)?.grades ?? [];

  if (state.ok) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <div className="text-3xl">✓</div>
        <h2 className="mt-2 text-xl font-semibold text-green-800">
          Inquiry received
        </h2>
        <p className="mt-1 text-sm text-green-700">
          Thank you. Our admissions team will be in touch shortly.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Child's first name" required>
          <input name="firstName" required className={input} />
        </Field>
        <Field label="Child's last name" required>
          <input name="lastName" required className={input} />
        </Field>
        <Field label="Child's date of birth">
          <input name="dateOfBirth" type="date" className={input} />
        </Field>
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
        <Field label="Grade applying for">
          <select name="gradeLevelId" className={input} defaultValue="">
            <option value="">Not sure yet</option>
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="border-t border-[color:var(--color-line)] pt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Your name" required>
            <input name="guardianName" required className={input} />
          </Field>
          <Field label="Your email" required>
            <input name="guardianEmail" type="email" required className={input} />
          </Field>
          <Field label="Your phone">
            <input name="guardianPhone" className={input} />
          </Field>
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" value="yes" className="mt-1" />
        <span>
          I am the parent/guardian and consent to the school contacting me about
          this inquiry.
        </span>
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-inset ring-red-200">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit inquiry"}
      </button>
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
