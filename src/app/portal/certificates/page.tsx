import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { issueCertificate, issueIdCard } from "./actions";
import { DeleteCertButton, EditCertButton } from "./CertActions";
import Link from "next/link";

export const metadata = { title: "Certificates & ID Cards" };

const CERT_LABELS: Record<string, string> = {
  BONAFIDE: "Bonafide",
  TRANSFER: "School Leaving",
  CHARACTER: "Character",
};

export default async function Certificates() {
  const ctx = await requirePermission("student.write");

  const [campuses, students, issues, year, cards] = await Promise.all([
    prisma.campus.findMany({
      where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
      orderBy: { name: "asc" },
    }),
    prisma.student.findMany({
      where: { tenantId: ctx.tenantId! },
      include: { person: true },
      orderBy: { admissionNumber: "asc" },
      take: 200,
    }),
    prisma.certificateIssue.findMany({
      where: { tenantId: ctx.tenantId! },
      include: { student: { include: { person: true } } },
      orderBy: { issuedAt: "desc" },
      take: 50,
    }),
    prisma.academicYear.findFirst({
      where: { tenantId: ctx.tenantId!, isCurrent: true },
    }),
    prisma.studentIdCard.findMany({
      where: { tenantId: ctx.tenantId! },
      include: { student: { include: { person: true } } },
      orderBy: { issuedAt: "desc" },
      take: 20,
    }),
  ]);

  const campus = campuses[0];
  if (!campus) return <main className="p-6">No campus available.</main>;

  const studentOptions = students.map((s) => (
    <option key={s.id} value={s.id}>
      {s.admissionNumber} — {s.person.firstName} {s.person.lastName}
    </option>
  ));

  return (
    <main className="space-y-6 p-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Certificates &amp; ID Cards</h1>

      {/* Issue certificate */}
      <section className="rounded-lg border border-[color:var(--color-line)] bg-white p-5 space-y-3">
        <h2 className="font-semibold">Issue certificate</h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          Select a student and certificate type. A printable certificate will be generated instantly.
        </p>
        <form action={issueCertificate} className="flex flex-wrap gap-2 items-end">
          {campuses.length > 1 ? (
            <div>
              <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Campus</label>
              <select name="campusId" className="rounded-md border border-[color:var(--color-line)] px-2.5 py-1.5 text-sm">
                {campuses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : (
            <input type="hidden" name="campusId" value={campus.id} />
          )}
          <div>
            <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Student</label>
            <select name="studentId" className="rounded-md border border-[color:var(--color-line)] px-2.5 py-1.5 text-sm">
              {studentOptions}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Type</label>
            <select name="type" className="rounded-md border border-[color:var(--color-line)] px-2.5 py-1.5 text-sm">
              <option value="BONAFIDE">Bonafide certificate</option>
              <option value="TRANSFER">School Leaving certificate</option>
              <option value="CHARACTER">Character certificate</option>
            </select>
          </div>
          <button className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
            Issue &amp; print
          </button>
        </form>
      </section>

      {/* Issue ID card */}
      {year && (
        <section className="rounded-lg border border-[color:var(--color-line)] bg-white p-5 space-y-3">
          <h2 className="font-semibold">Issue / renew ID card</h2>
          <form action={issueIdCard} className="flex flex-wrap gap-2 items-end">
            <input type="hidden" name="academicYearId" value={year.id} />
            <div>
              <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Student</label>
              <select name="studentId" className="rounded-md border border-[color:var(--color-line)] px-2.5 py-1.5 text-sm">
                {studentOptions}
              </select>
            </div>
            <button className="rounded-md bg-slate-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-900">
              Issue / renew ID card
            </button>
          </form>
        </section>
      )}

      {/* Certificate log */}
      <section className="rounded-lg border border-[color:var(--color-line)] bg-white p-5 space-y-3">
        <h2 className="font-semibold">Certificate log</h2>
        {issues.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">No certificates issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-line)] text-xs uppercase text-[color:var(--color-muted)]">
                  <th className="py-2 pr-3 text-left">Certificate #</th>
                  <th className="py-2 pr-3 text-left">Type</th>
                  <th className="py-2 pr-3 text-left">Student</th>
                  <th className="py-2 pr-3 text-left">Issued</th>
                  <th className="py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {issues.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-mono text-xs">{i.number}</td>
                    <td className="py-2 pr-3">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        {CERT_LABELS[i.certificateType] ?? i.certificateType}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {i.student.person.firstName} {i.student.person.lastName}
                      <span className="ml-1 text-xs text-[color:var(--color-muted)]">({i.student.admissionNumber})</span>
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--color-muted)]">
                      {i.issuedAt.toLocaleDateString()}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/portal/certificates/${i.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-700 hover:underline text-xs"
                        >
                          Print →
                        </Link>
                        <EditCertButton id={i.id} currentType={i.certificateType} />
                        <DeleteCertButton id={i.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ID card log */}
      {cards.length > 0 && (
        <section className="rounded-lg border border-[color:var(--color-line)] bg-white p-5 space-y-3">
          <h2 className="font-semibold">Recent ID cards</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-line)] text-xs uppercase text-[color:var(--color-muted)]">
                  <th className="py-2 pr-3 text-left">Card number</th>
                  <th className="py-2 pr-3 text-left">Student</th>
                  <th className="py-2 pr-3 text-left">Year</th>
                  <th className="py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {cards.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-3 font-mono text-xs">{c.cardNumber}</td>
                    <td className="py-2 pr-3">
                      {c.student.person.firstName} {c.student.person.lastName}
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--color-muted)]">{c.academicYearId.slice(-6)}</td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                        {c.active ? "Active" : "Revoked"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
