import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { familyAccess } from "@/lib/family";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/attendance";
import { agingBucket } from "@/lib/fee-report-calc";
import { PageHeader, Card, Badge, StatCard } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { requestStudentLeave, cancelStudentLeave } from "../actions";

export const metadata = { title: "Child overview" };

const DAYS = [["MON", "Mon"], ["TUE", "Tue"], ["WED", "Wed"], ["THU", "Thu"], ["FRI", "Fri"], ["SAT", "Sat"]] as const;
const TABS = [["overview", "Overview"], ["attendance", "Attendance"], ["results", "Results"], ["fees", "Fees"], ["timetable", "Timetable"], ["leave", "Leave"]] as const;

export default async function ChildPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireUser();
  const { studentId } = await params;
  const link = await familyAccess(ctx, studentId); // deny by default: only linked family
  if (!link) notFound();
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId! },
    include: { person: true, enrollments: { where: { status: "ACTIVE" }, include: { campus: true, gradeLevel: true, section: true }, orderBy: { startDate: "desc" }, take: 1 } },
  });
  if (!student) notFound();
  const sp = await searchParams;
  const visible = TABS.filter(([k]) => (k !== "fees" || link.canSeeFees) && (k !== "leave" || link.relation === "guardian"));
  const tab = visible.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const enr = student.enrollments[0];
  const name = `${student.person.firstName} ${student.person.lastName}`;
  const th = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";

  // Overview numbers
  const since = new Date(Date.now() - 30 * 86_400_000);
  const recent = tab === "overview"
    ? await prisma.attendanceRecord.findMany({ where: { studentId, tenantId: ctx.tenantId!, session: { date: { gte: since }, status: { in: ["SUBMITTED", "LOCKED"] } } }, include: { code: true } })
    : [];
  const present = recent.filter((r) => r.code.countsAsPresent).length;
  const pct = recent.length ? Math.round((present / recent.length) * 100) : null;

  return (
    <div>
      <div className="mb-4 print:hidden"><Link href="/portal/family" className="text-sm text-brand-700 hover:underline">← My children</Link></div>
      <PageHeader title={name} subtitle={enr ? `${enr.campus.name} · ${enr.gradeLevel.name} · ${enr.section.name} · ${student.admissionNumber}` : `Admission no. ${student.admissionNumber}`} />
      <div className="mb-6 flex flex-wrap gap-5 border-b border-[color:var(--color-line)]">
        {visible.map(([k, label]) => (
          <Link key={k} href={`?tab=${k}`} className={k === tab ? "border-b-2 border-brand-700 pb-2 text-sm font-semibold text-brand-700" : "pb-2 text-sm text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"}>{label}</Link>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab studentId={studentId} tenantId={ctx.tenantId!} pct={pct} total={recent.length} absences={recent.length - present} canSeeFees={link.canSeeFees} />
      )}

      {tab === "attendance" && <AttendanceTab studentId={studentId} tenantId={ctx.tenantId!} th={th} />}
      {tab === "results" && <ResultsTab studentId={studentId} tenantId={ctx.tenantId!} th={th} />}
      {tab === "fees" && link.canSeeFees && <FeesTab studentId={studentId} tenantId={ctx.tenantId!} th={th} />}
      {tab === "timetable" && <TimetableTab sectionId={enr?.sectionId} campusId={enr?.campusId} tenantId={ctx.tenantId!} />}
      {tab === "leave" && link.relation === "guardian" && <LeaveTab studentId={studentId} personId={student.personId} tenantId={ctx.tenantId!} th={th} />}
    </div>
  );
}

async function OverviewTab({ studentId, tenantId, pct, total, absences, canSeeFees }: { studentId: string; tenantId: string; pct: number | null; total: number; absences: number; canSeeFees: boolean }) {
  const [bal, latest, pendingLeave] = await Promise.all([
    canSeeFees ? prisma.invoice.aggregate({ where: { tenantId, studentId, status: { in: ["OPEN", "PARTIAL"] } }, _sum: { balance: true } }) : null,
    prisma.studentResult.findFirst({ where: { tenantId, studentId, version: { status: "PUBLISHED" } }, orderBy: { version: { publishedAt: "desc" } }, include: { version: { include: { plan: true } } } }),
    prisma.leaveRequest.count({ where: { tenantId, person: { student: { id: studentId } }, status: "PENDING" } }),
  ]);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Attendance (30 days)" value={pct === null ? "—" : `${pct}%`} tone={pct !== null && pct < 90 ? "amber" : "green"} hint={`${total} sessions recorded`} />
        <StatCard label="Absences (30 days)" value={absences} tone={absences > 0 ? "amber" : "slate"} />
        {canSeeFees && <StatCard label="Fee balance" value={formatMoney(bal?._sum.balance ?? 0)} tone={(bal?._sum.balance ?? 0) > 0 ? "amber" : "green"} />}
        <StatCard label="Leave requests pending" value={pendingLeave} tone="slate" />
      </div>
      <Card>
        <h3 className="mb-2 font-semibold">Latest report card</h3>
        {latest ? (
          <p className="text-sm">{latest.version.plan.name}: <b>{latest.overallPercent}%</b> ({latest.overallGrade}){latest.rank ? `, rank ${latest.rank}` : ""} · <Link className="text-brand-700 hover:underline" href={`/portal/exams/${latest.version.planId}/report/${studentId}`}>View report card</Link></p>
        ) : <p className="text-sm text-[color:var(--color-muted)]">No report card has been published yet.</p>}
      </Card>
    </div>
  );
}

async function AttendanceTab({ studentId, tenantId, th }: { studentId: string; tenantId: string; th: string }) {
  const recs = await prisma.attendanceRecord.findMany({
    where: { studentId, tenantId, session: { status: { in: ["SUBMITTED", "LOCKED"] }, date: { gte: new Date(Date.now() - 90 * 86_400_000) } } },
    include: { code: true, session: true },
    orderBy: { session: { date: "desc" } },
    take: 120,
  });
  const counted = recs.filter((r) => r.code.countsAsPresent).length;
  const tone = (c: string) => (c === "ABSENT" ? "red" : c === "LATE" ? "amber" : c === "PRESENT" || c === "REMOTE" ? "green" : "sky") as "red" | "amber" | "green" | "sky";
  return (
    <div className="space-y-4">
      <Card><p className="text-sm">Last 90 days: <b>{recs.length ? Math.round((counted / recs.length) * 100) : "—"}{recs.length ? "%" : ""}</b> present across {recs.length} recorded day(s).</p></Card>
      <Card className="overflow-x-auto">
        {recs.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No attendance has been recorded yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Date</th><th className={th}>Status</th><th className={th}>Note</th></tr></thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {recs.map((r) => <tr key={r.id}><td className="py-2 pr-4 whitespace-nowrap">{formatDay(r.session.date)}</td><td className="py-2 pr-4"><Badge tone={tone(r.code.category)}>{r.code.label}</Badge></td><td className="py-2 text-[color:var(--color-muted)]">{r.note ?? ""}</td></tr>)}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

async function ResultsTab({ studentId, tenantId, th }: { studentId: string; tenantId: string; th: string }) {
  const results = await prisma.studentResult.findMany({ where: { studentId, tenantId, version: { status: "PUBLISHED" } }, include: { version: { include: { plan: { include: { term: true } } } } }, orderBy: { version: { publishedAt: "desc" } } });
  return (
    <Card className="overflow-x-auto">
      {results.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No results have been published yet.</p> : (
        <table className="w-full text-sm">
          <thead><tr><th className={th}>Assessment</th><th className={th}>Term</th><th className={`${th} text-right`}>Overall</th><th className={th}>Grade</th><th className={th}>Rank</th><th /></tr></thead>
          <tbody className="divide-y divide-[color:var(--color-line)]">
            {results.map((r) => (
              <tr key={r.id}><td className="py-2 pr-4">{r.version.plan.name}</td><td className="py-2 pr-4">{r.version.plan.term.name}</td><td className="py-2 pr-4 text-right">{r.overallPercent}%</td><td className="py-2 pr-4">{r.overallGrade}</td><td className="py-2 pr-4">{r.rank ?? "—"}</td><td className="py-2 text-right"><Link className="text-brand-700 hover:underline" href={`/portal/exams/${r.version.planId}/report/${studentId}`}>Report card</Link></td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

async function FeesTab({ studentId, tenantId, th }: { studentId: string; tenantId: string; th: string }) {
  const [invoices, payments] = await Promise.all([
    prisma.invoice.findMany({ where: { studentId, tenantId }, orderBy: { issueDate: "desc" }, take: 50 }),
    prisma.payment.findMany({ where: { studentId, tenantId, status: { in: ["CONFIRMED", "REVERSED"] } }, orderBy: { receivedAt: "desc" }, take: 50 }),
  ]);
  const due = invoices.filter((i) => i.status === "OPEN" || i.status === "PARTIAL").reduce((s, i) => s + i.balance, 0);
  return (
    <div className="space-y-6">
      <Card><p className="text-sm">Total outstanding: <b>{formatMoney(due)}</b>. To pay, use the school's payment channels and keep your receipt; payments appear here once recorded.</p></Card>
      <Card className="overflow-x-auto">
        <h3 className="mb-2 font-semibold">Invoices</h3>
        {invoices.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No invoices.</p> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Invoice</th><th className={th}>Period</th><th className={th}>Due</th><th className={th}>Status</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Balance</th></tr></thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {invoices.map((i) => {
                const overdue = (i.status === "OPEN" || i.status === "PARTIAL") && agingBucket(i.dueDate, new Date()) !== "Current";
                return <tr key={i.id}><td className="py-2 pr-4">{i.number}</td><td className="py-2 pr-4">{i.periodLabel}</td><td className="py-2 pr-4 whitespace-nowrap">{formatDay(i.dueDate)}</td><td className="py-2 pr-4"><Badge tone={i.status === "PAID" ? "green" : overdue ? "red" : "amber"}>{overdue ? "OVERDUE" : i.status}</Badge></td><td className="py-2 pr-4 text-right">{formatMoney(i.total)}</td><td className="py-2 text-right font-medium">{formatMoney(i.balance)}</td></tr>;
              })}
            </tbody>
          </table>
        )}
      </Card>
      <Card className="overflow-x-auto">
        <h3 className="mb-2 font-semibold">Payments</h3>
        {payments.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No payments yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Receipt</th><th className={th}>Date</th><th className={th}>Method</th><th className={`${th} text-right`}>Amount</th></tr></thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {payments.map((p) => <tr key={p.id}><td className="py-2 pr-4"><Link className="text-brand-700 hover:underline" href={`/portal/family/${studentId}/receipt/${p.id}`}>{p.number}</Link>{p.status === "REVERSED" && <span className="ml-2"><Badge tone="red">Reversed</Badge></span>}</td><td className="py-2 pr-4">{formatDay(p.receivedAt)}</td><td className="py-2 pr-4">{p.method}</td><td className="py-2 text-right">{formatMoney(p.amount)}</td></tr>)}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

async function TimetableTab({ sectionId, campusId, tenantId }: { sectionId?: string; campusId?: string; tenantId: string }) {
  const version = campusId ? await prisma.timetableVersion.findFirst({ where: { tenantId, campusId, status: "ACTIVE" } }) : null;
  const slots = version && sectionId ? await prisma.timetableSlot.findMany({ where: { versionId: version.id, sectionId, tenantId }, include: { subject: true, staff: { include: { person: true } }, room: true }, orderBy: [{ periodNumber: "asc" }] }) : [];
  if (!version || slots.length === 0) return <Card><p className="text-sm text-[color:var(--color-muted)]">The class timetable has not been published yet.</p></Card>;
  const periods = [...new Set(slots.map((s) => s.periodNumber))].sort((a, b) => a - b);
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr><th className="pb-2 pr-3 text-left text-xs uppercase text-[color:var(--color-muted)]">Period</th>{DAYS.map(([k, l]) => <th key={k} className="pb-2 pr-3 text-left text-xs uppercase text-[color:var(--color-muted)]">{l}</th>)}</tr></thead>
        <tbody className="divide-y divide-[color:var(--color-line)]">
          {periods.map((p) => (
            <tr key={p}>
              <td className="py-2 pr-3 font-medium">{p}</td>
              {DAYS.map(([k]) => {
                const s = slots.find((x) => x.periodNumber === p && x.dayOfWeek === k);
                return <td key={k} className="py-2 pr-3 align-top">{s ? <><p className="font-medium">{s.subject.name}</p><p className="text-xs text-[color:var(--color-muted)]">{s.startTime}–{s.endTime}{s.room ? ` · ${s.room.code}` : ""}</p>{s.staff && <p className="text-xs text-[color:var(--color-muted)]">{s.staff.person.firstName} {s.staff.person.lastName}</p>}</> : ""}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

async function LeaveTab({ studentId, personId, tenantId, th }: { studentId: string; personId: string; tenantId: string; th: string }) {
  const [types, reqs] = await Promise.all([
    prisma.leaveType.findMany({ where: { tenantId, appliesTo: { in: ["STUDENT", "BOTH"] } }, orderBy: { name: "asc" } }),
    prisma.leaveRequest.findMany({ where: { tenantId, personId }, include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const tone = (s: string) => (s === "APPROVED" ? "green" : s === "REJECTED" ? "red" : s === "PENDING" ? "amber" : "slate") as "green" | "red" | "amber" | "slate";
  return (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-3 font-semibold">Report an absence or request leave</h3>
        {types.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">The school has not set up leave types for students yet. Please contact the office.</p> : (
          <ActionForm action={requestStudentLeave} submit="Send to school" pendingLabel="Sending…" className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="studentId" value={studentId} />
            <label><span className={labelCls}>Type</span><select name="leaveTypeId" required className={inputCls}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <span />
            <label><span className={labelCls}>From</span><input type="date" name="startDate" defaultValue={today} required className={inputCls} /></label>
            <label><span className={labelCls}>To</span><input type="date" name="endDate" defaultValue={today} required className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>Reason</span><input name="reason" required minLength={3} maxLength={500} className={inputCls} /></label>
          </ActionForm>
        )}
      </Card>
      <Card className="overflow-x-auto">
        <h3 className="mb-2 font-semibold">Requests</h3>
        {reqs.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">None yet.</p> : (
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Dates</th><th className={th}>Type</th><th className={th}>Status</th><th className={th}>Note from school</th><th /></tr></thead>
            <tbody className="divide-y divide-[color:var(--color-line)]">
              {reqs.map((r) => (
                <tr key={r.id}><td className="py-2 pr-4 whitespace-nowrap">{r.startDate.toISOString().slice(0, 10)} → {r.endDate.toISOString().slice(0, 10)}</td><td className="py-2 pr-4">{r.leaveType.name}</td><td className="py-2 pr-4"><Badge tone={tone(r.status)}>{r.status}</Badge></td><td className="py-2 pr-4 text-[color:var(--color-muted)]">{r.reviewNote ?? ""}</td><td className="py-2 text-right">{r.status === "PENDING" && <ActionForm action={cancelStudentLeave} submit="Cancel" variant="ghost"><input type="hidden" name="requestId" value={r.id} /></ActionForm>}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
