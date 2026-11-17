import { requirePermission } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, ButtonLink } from "@/components/ui";
import Link from "next/link";

const WINDOW_DAYS = 30;
const CHRONIC_THRESHOLD = 85; // below this % = chronic absence

export default async function AttendanceAnalyticsPage() {
  const ctx = await requirePermission("attendance.read");
  const campusIds = allowedCampusIds(ctx, "attendance.read");

  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  // Load sections with their sessions in window
  const sections = await prisma.section.findMany({
    where: {
      tenantId: ctx.tenantId!,
      ...(campusIds ? { campusId: { in: campusIds } } : {}),
    },
    include: {
      campus: true,
      gradeLevel: true,
      enrollments: {
        where: { status: "ACTIVE" },
        include: { student: { include: { person: true } } },
      },
      attendanceSessions: {
        where: { date: { gte: since }, status: "SUBMITTED" },
        include: {
          records: { include: { code: true } },
        },
      },
    },
    orderBy: [{ campus: { name: "asc" } }, { gradeLevel: { rank: "asc" } }],
  });

  // Per-section summary
  type SectionStat = {
    id: string;
    name: string;
    campus: string;
    gradeLevel: string;
    totalSessions: number;
    avgAttendancePct: number;
    chronicCount: number;
    studentStats: { studentId: string; name: string; admissionNumber: string; pct: number; sessions: number }[];
  };

  const sectionStats: SectionStat[] = sections.map((sec) => {
    const sessions = sec.attendanceSessions;
    const enrolled = sec.enrollments.map((e) => e.student);

    // Per-student presence counts
    const presenceMap: Record<string, { present: number; total: number }> = {};
    for (const student of enrolled) {
      presenceMap[student.id] = { present: 0, total: 0 };
    }

    for (const session of sessions) {
      for (const rec of session.records) {
        if (presenceMap[rec.studentId]) {
          presenceMap[rec.studentId].total++;
          if (rec.code.countsAsPresent) presenceMap[rec.studentId].present++;
        }
      }
    }

    const studentStats = enrolled.map((s) => {
      const stat = presenceMap[s.id] ?? { present: 0, total: 0 };
      const pct = stat.total === 0 ? 100 : Math.round((stat.present / stat.total) * 100);
      return {
        studentId: s.id,
        name: `${s.person.firstName} ${s.person.lastName}`,
        admissionNumber: s.admissionNumber,
        pct,
        sessions: stat.total,
      };
    });

    // Section average: mean of student attendance %
    const avgAttendancePct =
      studentStats.length === 0
        ? 100
        : Math.round(studentStats.reduce((s, st) => s + st.pct, 0) / studentStats.length);

    const chronicCount = studentStats.filter((s) => s.sessions > 0 && s.pct < CHRONIC_THRESHOLD).length;

    return {
      id: sec.id,
      name: sec.name,
      campus: sec.campus.name,
      gradeLevel: sec.gradeLevel.name,
      totalSessions: sessions.length,
      avgAttendancePct,
      chronicCount,
      studentStats,
    };
  });

  // Chronic absentees across all sections
  const chronic = sectionStats.flatMap((sec) =>
    sec.studentStats
      .filter((s) => s.sessions > 0 && s.pct < CHRONIC_THRESHOLD)
      .map((s) => ({ ...s, sectionName: `${sec.gradeLevel} · ${sec.name}`, campus: sec.campus, sectionId: sec.id }))
  );
  chronic.sort((a, b) => a.pct - b.pct);

  const pctColor = (pct: number) =>
    pct >= 95 ? "text-green-700" : pct >= 85 ? "text-amber-700" : "text-red-700";

  return (
    <div>
      <PageHeader
        title="Attendance analytics"
        subtitle={`Section averages and chronic absence · last ${WINDOW_DAYS} days`}
        action={
          <ButtonLink href="/portal/attendance" variant="ghost">
            ← Attendance
          </ButtonLink>
        }
      />

      {/* Section overview table */}
      <Card className="mb-6">
        <h3 className="mb-3 font-semibold">Section attendance ({WINDOW_DAYS}-day window)</h3>
        {sectionStats.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">No sections in your scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Section</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Campus</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Sessions</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Avg %</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Chronic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {sectionStats.map((sec) => (
                  <tr key={sec.id}>
                    <td className="py-2 pr-4 text-sm font-medium">
                      {sec.gradeLevel} · {sec.name}
                    </td>
                    <td className="py-2 pr-4 text-sm text-[color:var(--color-muted)]">{sec.campus}</td>
                    <td className="py-2 pr-4 text-right text-sm">{sec.totalSessions}</td>
                    <td className={`py-2 pr-4 text-right text-sm font-semibold ${pctColor(sec.avgAttendancePct)}`}>
                      {sec.avgAttendancePct}%
                    </td>
                    <td className="py-2 text-right text-sm">
                      {sec.chronicCount > 0 ? (
                        <Badge tone="red">{sec.chronicCount}</Badge>
                      ) : (
                        <span className="text-[color:var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Chronic absentees */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Chronic absentees (&lt; {CHRONIC_THRESHOLD}%)</h3>
          <span className="text-sm text-[color:var(--color-muted)]">{chronic.length} student{chronic.length !== 1 ? "s" : ""}</span>
        </div>
        {chronic.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">No chronic absentees in your scope. Great!</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Student</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Section</th>
                  <th className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Campus</th>
                  <th className="pb-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Sessions</th>
                  <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {chronic.map((s) => (
                  <tr key={`${s.sectionId}-${s.studentId}`}>
                    <td className="py-2 pr-4 text-sm">
                      <Link href={`/portal/students/${s.studentId}`} className="font-medium text-brand-700 hover:underline">
                        {s.name}
                      </Link>
                      <span className="ml-2 text-xs text-[color:var(--color-muted)]">{s.admissionNumber}</span>
                    </td>
                    <td className="py-2 pr-4 text-sm text-[color:var(--color-muted)]">{s.sectionName}</td>
                    <td className="py-2 pr-4 text-sm text-[color:var(--color-muted)]">{s.campus}</td>
                    <td className="py-2 pr-4 text-right text-sm">{s.sessions}</td>
                    <td className={`py-2 text-right text-sm font-semibold ${pctColor(s.pct)}`}>{s.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
