import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { dayStart } from "@/lib/dates";
import { parseDay, formatDay, SHORTAGE_DEFAULT } from "@/lib/attendance";
import { attendanceReport } from "@/lib/attendance-report";
import { PageHeader, Card, Badge, ButtonLink, EmptyState } from "@/components/ui";

export default async function AttendanceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; sectionId?: string; threshold?: string; view?: string }>;
}) {
  const ctx = await requirePermission("attendance.read");
  const sp = await searchParams;
  const campusIds = allowedCampusIds(ctx, "attendance.read");

  const today = dayStart();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  const from = parseDay(sp.from) ?? defaultFrom;
  const to = parseDay(sp.to) ?? today;
  const threshold = Math.min(100, Math.max(1, Number(sp.threshold) || SHORTAGE_DEFAULT));
  const view = sp.view === "daily" ? "daily" : "summary";

  const sections = await prisma.section.findMany({
    where: { tenantId: ctx.tenantId!, ...(campusIds ? { campusId: { in: campusIds } } : {}) },
    include: { gradeLevel: true, campus: true },
    orderBy: [{ campus: { name: "asc" } }, { gradeLevel: { rank: "asc" } }, { name: "asc" }],
  });
  // A section outside the caller's scope is silently ignored.
  const sectionId = sections.some((s) => s.id === sp.sectionId) ? sp.sectionId : undefined;

  const rangeError = from > to ? "The start date must not be after the end date." : null;
  const data = rangeError
    ? null
    : await attendanceReport({ tenantId: ctx.tenantId!, campusIds, sectionId, from, to });

  const q = new URLSearchParams({ from: formatDay(from), to: formatDay(to), threshold: String(threshold) });
  if (sectionId) q.set("sectionId", sectionId);
  const exportHref = (v: string) => `/api/portal/attendance/export?${q}&view=${v}`;
  const flagged = data?.students.filter((s) => s.pct !== null && s.pct < threshold) ?? [];
  const tone = (pct: number | null) => (pct === null ? "text-[color:var(--color-muted)]" : pct >= 95 ? "text-green-700" : pct >= threshold ? "text-amber-700" : "text-red-700");
  const th = "pb-2 pr-4 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";

  return (
    <div>
      <PageHeader
        title="Attendance reports"
        subtitle="Submitted and locked registers only; drafts are not counted"
        action={<ButtonLink href="/portal/attendance" variant="ghost">← Attendance</ButtonLink>}
      />

      <Card className="mb-6">
        <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="view" value={view} />
          <label>
            <span className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">From</span>
            <input type="date" name="from" defaultValue={formatDay(from)} className="rounded-lg border border-[color:var(--color-line)] px-3 py-2" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">To</span>
            <input type="date" name="to" defaultValue={formatDay(to)} className="rounded-lg border border-[color:var(--color-line)] px-3 py-2" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">Section</span>
            <select name="sectionId" defaultValue={sectionId ?? ""} className="rounded-lg border border-[color:var(--color-line)] px-3 py-2">
              <option value="">All sections in scope</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.campus.name} · {s.gradeLevel.name} {s.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium text-[color:var(--color-muted)]">Shortage below %</span>
            <input type="number" name="threshold" min={1} max={100} defaultValue={threshold} className="w-24 rounded-lg border border-[color:var(--color-line)] px-3 py-2" />
          </label>
          <button className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">Run report</button>
        </form>
        {rangeError && <p className="mt-3 text-sm text-red-700">{rangeError}</p>}
      </Card>

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card><p className="text-xs text-[color:var(--color-muted)]">Registers counted</p><p className="text-2xl font-semibold">{data.sessions}</p></Card>
            <Card><p className="text-xs text-[color:var(--color-muted)]">Overall attendance</p><p className={`text-2xl font-semibold ${tone(data.overallPct)}`}>{data.overallPct === null ? "—" : `${data.overallPct}%`}</p></Card>
            <Card><p className="text-xs text-[color:var(--color-muted)]">Absences / lates</p><p className="text-2xl font-semibold">{data.totals.absent} / {data.totals.late}</p></Card>
            <Card><p className="text-xs text-[color:var(--color-muted)]">Below {threshold}%</p><p className="text-2xl font-semibold">{flagged.length}</p></Card>
          </div>

          <div className="mb-3 flex items-center gap-2 text-sm">
            <Link href={`?${new URLSearchParams({ ...Object.fromEntries(q), view: "summary" })}`} className={`rounded-full px-3 py-1 ${view === "summary" ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)]"}`}>By student</Link>
            <Link href={`?${new URLSearchParams({ ...Object.fromEntries(q), view: "daily" })}`} className={`rounded-full px-3 py-1 ${view === "daily" ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)]"}`}>Absence &amp; late log</Link>
            <a href={exportHref(view)} className="ml-auto rounded-lg bg-white px-3 py-1.5 font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">Download CSV</a>
          </div>

          {view === "summary" ? (
            data.students.length === 0 ? (
              <EmptyState title="No submitted registers in this range" hint="Widen the dates or pick another section." />
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className={th}>Student</th><th className={th}>Section</th>
                        <th className={`${th} text-right`}>P</th><th className={`${th} text-right`}>A</th><th className={`${th} text-right`}>L</th>
                        <th className={`${th} text-right`}>Exc.</th><th className={`${th} text-right`}>Leave</th><th className={`${th} text-right`}>%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-line)]">
                      {data.students.map((s) => (
                        <tr key={s.studentId}>
                          <td className="py-2 pr-4">
                            <Link href={`/portal/students/${s.studentId}`} className="font-medium text-brand-700 hover:underline">{s.name}</Link>
                            <span className="ml-2 text-xs text-[color:var(--color-muted)]">{s.admissionNumber}</span>
                          </td>
                          <td className="py-2 pr-4 text-[color:var(--color-muted)]">{s.section}</td>
                          <td className="py-2 pr-4 text-right">{s.tally.present}</td>
                          <td className="py-2 pr-4 text-right">{s.tally.absent}</td>
                          <td className="py-2 pr-4 text-right">{s.tally.late}</td>
                          <td className="py-2 pr-4 text-right">{s.tally.excused}</td>
                          <td className="py-2 pr-4 text-right">{s.tally.leave}</td>
                          <td className={`py-2 text-right font-semibold ${tone(s.pct)}`}>
                            {s.pct === null ? "—" : `${s.pct}%`}
                            {s.pct !== null && s.pct < threshold && <Badge tone="red" >Shortage</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )
          ) : data.daily.length === 0 ? (
            <EmptyState title="No absences or lates in this range" hint="Everyone counted was present." />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left"><th className={th}>Date</th><th className={th}>Student</th><th className={th}>Section</th><th className={th}>Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-line)]">
                    {[...data.daily].reverse().map((d, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-4 whitespace-nowrap">{formatDay(d.date)}</td>
                        <td className="py-2 pr-4">{d.student} <span className="text-xs text-[color:var(--color-muted)]">{d.admissionNumber}</span></td>
                        <td className="py-2 pr-4 text-[color:var(--color-muted)]">{d.section}</td>
                        <td className="py-2"><Badge tone={d.category === "ABSENT" ? "red" : d.category === "LATE" ? "amber" : "sky"}>{d.label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
