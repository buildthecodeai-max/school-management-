import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PageHeader, Card, Badge, StatCard } from "@/components/ui";
import { recordPayment, issueRefund } from "../../fees/actions";
import {
  transferStudent as _transferStudent,
  markAlumni as _markAlumni,
  reenrollStudent as _reenrollStudent,
  suspendEnrollment as _suspendEnrollment,
  withdrawEnrollment as _withdrawEnrollment,
  updateGuardianLink as _updateGuardianLink,
} from "../actions";

async function updateGuardianLink(fd: FormData) { "use server"; await _updateGuardianLink(fd); }

// Plain-form wrappers — Server Action <form action> expects (formData) not (_prev, formData).
async function transferStudentAction(fd: FormData) { "use server"; await _transferStudent({}, fd); }
async function markAlumniAction(fd: FormData) { "use server"; await _markAlumni({}, fd); }
async function reenrollStudentAction(fd: FormData) { "use server"; await _reenrollStudent({}, fd); }
async function suspendEnrollmentAction(fd: FormData) { "use server"; await _suspendEnrollment({}, fd); }
async function withdrawEnrollmentAction(fd: FormData) { "use server"; await _withdrawEnrollment({}, fd); }

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePermission("student.read");
  const { id } = await params;

  const student = await prisma.student.findFirst({
    where: { id, tenantId: ctx.tenantId! },
    include: {
      person: true,
      enrollments: {
        include: { campus: true, gradeLevel: true, section: true, academicYear: true },
        orderBy: { startDate: "desc" },
      },
      guardianLinks: {
        include: { guardian: { include: { person: true } } },
      },
    },
  });

  if (!student) notFound();

  // Enforce campus scope: the user must be allowed on at least one of the
  // student's enrollment campuses.
  const allowed = allowedCampusIds(ctx, "student.read"); // null = all
  if (allowed) {
    const studentCampuses = new Set(student.enrollments.map((e) => e.campusId));
    const overlap = allowed.some((c) => studentCampuses.has(c));
    if (!overlap) notFound(); // do not reveal existence outside scope
  }

  // Attendance summary (30 days)
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const records = await prisma.attendanceRecord.findMany({
    where: { studentId: student.id, createdAt: { gte: since } },
    include: { code: true, session: true },
    orderBy: { createdAt: "desc" },
  });
  const present = records.filter((r) => r.code.countsAsPresent).length;
  const pct = records.length ? Math.round((present / records.length) * 100) : null;

  const p = student.person;
  const current = student.enrollments.find((e) => e.status === "ACTIVE");

  // ADM-006: lifecycle actions — available to users with student.write on the campus.
  const currentCampusId = current?.campusId;
  const canStudentWrite = currentCampusId
    ? canForCampus(ctx, "student.write", currentCampusId)
    : false;

  // Fetch campuses (for transfer target), academic years + grade levels + sections (for reenroll).
  const [allCampuses, currentYears, reenrollGradeLevels, reenrollSections] = canStudentWrite
    ? await Promise.all([
        prisma.campus.findMany({ where: { tenantId: ctx.tenantId! }, select: { id: true, name: true } }),
        currentCampusId
          ? prisma.academicYear.findMany({
              where: { tenantId: ctx.tenantId!, campusId: currentCampusId },
              select: { id: true, name: true },
              orderBy: { startDate: "desc" },
            })
          : Promise.resolve([]),
        currentCampusId
          ? prisma.gradeLevel.findMany({
              where: { tenantId: ctx.tenantId!, campusId: currentCampusId },
              select: { id: true, name: true, rank: true },
              orderBy: { rank: "asc" },
            })
          : Promise.resolve([]),
        currentCampusId
          ? prisma.section.findMany({
              where: { tenantId: ctx.tenantId!, campusId: currentCampusId },
              select: { id: true, name: true, gradeLevelId: true },
              orderBy: { name: "asc" },
            })
          : Promise.resolve([]),
      ])
    : [[], [], [], []];

  // Fees ledger — only for users with finance read on the student's campus.
  const canFeeRead = currentCampusId
    ? canForCampus(ctx, "fee.read", currentCampusId)
    : false;
  const canFeeCollect = currentCampusId
    ? canForCampus(ctx, "fee.collect", currentCampusId)
    : false;
  const canFeeAdjust = currentCampusId
    ? canForCampus(ctx, "fee.adjust", currentCampusId)
    : false;

  const [feeInvoices, feePayments] = canFeeRead
    ? await Promise.all([
        prisma.invoice.findMany({
          where: { studentId: student.id },
          orderBy: { createdAt: "desc" },
        }),
        prisma.payment.findMany({
          where: { studentId: student.id },
          orderBy: { receivedAt: "desc" },
        }),
      ])
    : [[], []];
  const feeBalance = feeInvoices.reduce((s, i) => s + i.balance, 0);
  const feeBilled = feeInvoices.reduce((s, i) => s + i.total, 0);

  // Published report cards
  const reportCards = await prisma.studentResult.findMany({
    where: { studentId: student.id, version: { status: "PUBLISHED" } },
    include: { version: { include: { plan: { include: { term: true } } } } },
  });

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/portal/students"
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back to students
        </Link>
      </div>

      <PageHeader
        title={`${p.firstName} ${p.lastName}`}
        subtitle={`Admission ${student.admissionNumber}${current ? ` · ${current.campus.name} · ${current.gradeLevel.name} ${current.section.name}` : ""}`}
        action={<Badge tone="green">{student.status}</Badge>}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Attendance (30d)"
          value={pct === null ? "—" : `${pct}%`}
          tone={pct !== null && pct < 90 ? "amber" : "green"}
        />
        <StatCard label="Sessions" value={records.length} tone="slate" />
        <StatCard
          label="Absences"
          value={records.filter((r) => r.code.category === "ABSENT").length}
          tone="amber"
        />
        <StatCard
          label="Guardians"
          value={student.guardianLinks.length}
          tone="sky"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-3 font-semibold">Profile</h3>
          <dl className="space-y-2 text-sm">
            <Row label="Full name" value={`${p.firstName} ${p.lastName}`} />
            <Row
              label="Date of birth"
              value={p.dateOfBirth ? p.dateOfBirth.toLocaleDateString() : "—"}
            />
            <Row label="Gender" value={p.gender} />
            <Row label="Email" value={p.email ?? "—"} />
            <Row label="Phone" value={p.phone ?? "—"} />
          </dl>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Guardians</h3>
          {student.guardianLinks.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">
              No guardians linked.
            </p>
          ) : (
            <ul className="space-y-3">
              {student.guardianLinks.map((g) => (
                <li key={g.id} className="text-sm">
                  <p className="font-medium">
                    {g.guardian.person.firstName} {g.guardian.person.lastName}
                  </p>
                  <p className="text-[color:var(--color-muted)]">
                    {g.relationship}
                    {g.guardian.person.phone
                      ? ` · ${g.guardian.person.phone}`
                      : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {g.isPrimaryContact && <Badge tone="brand">Primary</Badge>}
                    {g.financiallyResponsible && <Badge tone="sky">Fee payer</Badge>}
                    {g.canPickup && <Badge tone="green">Pickup</Badge>}
                    {g.receivesNotifications && <Badge tone="amber">Notifications</Badge>}
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-brand-700">Edit flags</summary>
                    <form action={updateGuardianLink} className="mt-2 space-y-1 text-xs">
                      <input type="hidden" name="id" value={g.id} />
                      {(["isPrimaryContact", "financiallyResponsible", "canPickup", "receivesNotifications"] as const).map((f) => (
                        <label key={f} className="flex items-center gap-2 capitalize">
                          <input type="hidden" name={f} value="false" />
                          <input type="checkbox" name={f} value="true" defaultChecked={g[f] as boolean} className="rounded" />
                          {f.replace(/([A-Z])/g, " $1").toLowerCase()}
                        </label>
                      ))}
                      <button className="mt-2 rounded bg-brand-600 px-3 py-1 text-white hover:bg-brand-700">Save</button>
                    </form>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Enrollment history</h3>
          <ul className="space-y-3">
            {student.enrollments.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-medium">
                    {e.gradeLevel.name} · {e.section.name}
                  </p>
                  <Badge tone={e.status === "ACTIVE" ? "green" : "slate"}>
                    {e.status}
                  </Badge>
                </div>
                <p className="text-[color:var(--color-muted)]">
                  {e.campus.name} · {e.academicYear.name}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <h3 className="mb-3 font-semibold">Recent attendance</h3>
          {records.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">
              No attendance recorded in the last 30 days.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {records.slice(0, 40).map((r) => (
                <span
                  key={r.id}
                  title={`${r.session.date.toLocaleDateString()} · ${r.code.label}`}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded text-xs font-semibold ${
                    r.code.category === "PRESENT"
                      ? "bg-green-100 text-green-700"
                      : r.code.category === "LATE"
                        ? "bg-amber-100 text-amber-700"
                        : r.code.category === "ABSENT"
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {r.code.code}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {reportCards.length > 0 && (
        <div className="mt-6">
          <Card>
            <h3 className="mb-3 font-semibold">Report cards</h3>
            <ul className="divide-y divide-[color:var(--color-line)]">
              {reportCards.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{r.version.plan.name}</span>
                    <span className="text-[color:var(--color-muted)]"> · {r.version.plan.term.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span>{r.overallPercent}% · {r.overallGrade}</span>
                    <Badge tone={r.passed ? "green" : "red"}>{r.passed ? "Pass" : "Fail"}</Badge>
                    <Link
                      href={`/portal/exams/${r.version.plan.id}/report/${student.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {canFeeRead && (
        <div className="mt-6">
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">Fees ledger</h3>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-[color:var(--color-muted)]">
                  Billed {formatMoney(feeBilled)}
                </span>
                <span className={`font-semibold ${feeBalance > 0 ? "text-amber-600" : "text-green-700"}`}>
                  Balance {formatMoney(feeBalance)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">
                  Invoices
                </p>
                {feeInvoices.length === 0 ? (
                  <p className="text-sm text-[color:var(--color-muted)]">None.</p>
                ) : (
                  <ul className="divide-y divide-[color:var(--color-line)] text-sm">
                    {feeInvoices.map((i) => (
                      <li key={i.id} className="flex items-center justify-between py-2">
                        <Link href={`/portal/fees/invoices/${i.id}`} className="text-brand-700 hover:underline">
                          {i.number}
                        </Link>
                        <span className="text-[color:var(--color-muted)]">{i.periodLabel}</span>
                        <span>{formatMoney(i.total)}</span>
                        <Badge tone={i.status === "PAID" ? "green" : i.status === "PARTIAL" ? "amber" : "sky"}>
                          {i.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[color:var(--color-muted)]">
                  Payments
                </p>
                {feePayments.length === 0 ? (
                  <p className="text-sm text-[color:var(--color-muted)]">None.</p>
                ) : (
                  <ul className="divide-y divide-[color:var(--color-line)] text-sm">
                    {feePayments.map((pm) => (
                      <li key={pm.id} className="flex items-center justify-between py-2">
                        <span className="font-medium">{pm.number}</span>
                        <span className="text-[color:var(--color-muted)]">{pm.method}</span>
                        <span className="text-green-700">{formatMoney(pm.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {(canFeeCollect || canFeeAdjust) && (
              <div className="mt-4 flex flex-wrap gap-6 border-t border-[color:var(--color-line)] pt-4">
                {canFeeCollect && feeBalance > 0 && (
                  <form action={recordPayment} className="flex items-end gap-2">
                    <input type="hidden" name="studentId" value={student.id} />
                    <div>
                      <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Payment ($)</label>
                      <input name="amount" type="number" step="0.01" defaultValue={(feeBalance / 100).toFixed(2)} className={inputCls} />
                    </div>
                    <select name="method" className={inputCls} defaultValue="CASH">
                      <option value="CASH">Cash</option>
                      <option value="BANK">Bank</option>
                      <option value="CARD">Card</option>
                      <option value="GATEWAY">Gateway</option>
                    </select>
                    <button className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                      Record
                    </button>
                  </form>
                )}
                {canFeeAdjust && (
                  <form action={issueRefund} className="flex items-end gap-2">
                    <input type="hidden" name="studentId" value={student.id} />
                    <div>
                      <label className="mb-1 block text-xs text-[color:var(--color-muted)]">Refund ($)</label>
                      <input name="amount" type="number" step="0.01" className={inputCls} />
                    </div>
                    <input name="reason" placeholder="Reason" className={inputCls} />
                    <button className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">
                      Refund
                    </button>
                  </form>
                )}
              </div>
            )}
          </Card>
        </div>
      )}

      {canStudentWrite && currentCampusId && (
        <div className="mt-6">
          <Card>
            <h3 className="mb-4 font-semibold">Student lifecycle</h3>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* Transfer */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                  Transfer to another campus
                </p>
                <form action={transferStudentAction} className="space-y-2">
                  <input type="hidden" name="studentId" value={student.id} />
                  <input type="hidden" name="fromCampusId" value={currentCampusId} />
                  <select name="toCampusId" className={inputCls} required>
                    <option value="">Select destination campus…</option>
                    {allCampuses
                      .filter((c) => c.id !== currentCampusId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                  <input name="reason" placeholder="Reason for transfer" className={inputCls} required />
                  <input name="effectiveDate" type="date" className={inputCls} required />
                  <button className="w-full rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                    Transfer student
                  </button>
                </form>
              </div>

              {/* Mark as alumni */}
              {current?.status === "ACTIVE" && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                    Mark as alumni
                  </p>
                  <form action={markAlumniAction} className="space-y-2">
                    <input type="hidden" name="studentId" value={student.id} />
                    <input type="hidden" name="campusId" value={currentCampusId} />
                    <input name="reason" placeholder="Graduation note (optional)" className={inputCls} />
                    <button className="w-full rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                      Graduate / mark alumni
                    </button>
                  </form>
                </div>
              )}

              {/* Reenroll */}
              {!current && currentYears.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                    Reenroll
                  </p>
                  <form action={reenrollStudentAction} className="space-y-2">
                    <input type="hidden" name="studentId" value={student.id} />
                    <input type="hidden" name="campusId" value={currentCampusId} />
                    <select name="academicYearId" className={inputCls} required>
                      {currentYears.map((y) => (
                        <option key={y.id} value={y.id}>{y.name}</option>
                      ))}
                    </select>
                    <select name="gradeLevelId" className={inputCls} required>
                      <option value="">Select grade level…</option>
                      {reenrollGradeLevels.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <select name="sectionId" className={inputCls} required>
                      <option value="">Select section…</option>
                      {reenrollSections.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button className="w-full rounded-lg bg-green-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-green-700">
                      Reenroll student
                    </button>
                  </form>
                </div>
              )}

              {/* Suspend enrollment */}
              {current?.status === "ACTIVE" && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                    Suspend enrollment
                  </p>
                  <form action={suspendEnrollmentAction} className="space-y-2">
                    <input type="hidden" name="studentId" value={student.id} />
                    <input type="hidden" name="campusId" value={currentCampusId} />
                    <input name="reason" placeholder="Reason (optional)" className={inputCls} />
                    <button className="w-full rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                      Suspend
                    </button>
                  </form>
                </div>
              )}

              {/* Withdraw enrollment */}
              {(current?.status === "ACTIVE" || current?.status === "SUSPENDED") && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
                    Withdraw student
                  </p>
                  <form action={withdrawEnrollmentAction} className="space-y-2">
                    <input type="hidden" name="studentId" value={student.id} />
                    <input type="hidden" name="campusId" value={currentCampusId} />
                    <input name="reason" placeholder="Reason for withdrawal" required className={inputCls} />
                    <button className="w-full rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700">
                      Withdraw
                    </button>
                  </form>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "rounded-lg border border-[color:var(--color-line)] bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[color:var(--color-muted)]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
