import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

const DEMO_ACCOUNTS: { role: string; email: string }[] = [
  { role: "Platform operator", email: "ops@scholarum.io" },
  { role: "Organization owner", email: "owner@hmss.edu" },
  { role: "Campus administrator", email: "admin@hmss.edu" },
  { role: "Admissions officer", email: "admissions@hmss.edu" },
  { role: "Finance officer", email: "finance@hmss.edu" },
  { role: "Teacher", email: "teacher@hmss.edu" },
  { role: "Parent / guardian", email: "parent@hmss.edu" },
];

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/portal");

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            📚
          </div>
          <span className="text-xl font-semibold">Scholarum</span>
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            One governed platform for every campus.
          </h1>
          <p className="mt-4 max-w-md text-brand-100">
            Admissions, student records, attendance, academics, fees and
            portals — multi-tenant, campus-scoped and auditable by design.
          </p>
        </div>
        <p className="text-sm text-brand-200">
          Multi-tenant · Subscription based · Multi-campus
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-col justify-center px-6 py-12 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
          <p className="mt-1 text-sm text-[color:var(--color-muted)]">
            Access your organization portal.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>

          <div className="mt-8 rounded-lg border border-[color:var(--color-line)] bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
              Demo accounts · password{" "}
              <code className="rounded bg-slate-100 px-1">password123</code>
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="flex justify-between gap-2">
                  <span className="text-[color:var(--color-muted)]">
                    {a.role}
                  </span>
                  <code className="text-brand-700">{a.email}</code>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
