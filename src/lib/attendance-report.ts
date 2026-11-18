import "server-only";
import { prisma } from "./db";
import { addToTally, attendancePct, emptyTally, type Tally } from "./attendance";

export type StudentAttendanceRow = {
  studentId: string;
  name: string;
  admissionNumber: string;
  section: string;
  campus: string;
  tally: Tally;
  pct: number | null;
};

export type DailyRow = { date: Date; section: string; student: string; admissionNumber: string; code: string; label: string; category: string };

/**
 * Attendance for submitted/locked registers in [from, to], scoped to the given
 * campuses (null = every campus of the tenant). Drafts never count.
 */
export async function attendanceReport(opts: {
  tenantId: string;
  campusIds: string[] | null;
  sectionId?: string;
  from: Date;
  to: Date;
}) {
  const { tenantId, campusIds, sectionId, from, to } = opts;
  const records = await prisma.attendanceRecord.findMany({
    where: {
      tenantId,
      session: {
        status: { in: ["SUBMITTED", "LOCKED"] },
        date: { gte: from, lte: to },
        ...(campusIds ? { campusId: { in: campusIds } } : {}),
        ...(sectionId ? { sectionId } : {}),
      },
    },
    include: {
      code: true,
      session: { include: { section: { include: { gradeLevel: true } }, campus: true } },
      student: { include: { person: true } },
    },
    orderBy: [{ session: { date: "asc" } }],
  });

  const byStudent = new Map<string, StudentAttendanceRow & { counted: number }>();
  const daily: DailyRow[] = [];
  const totals = emptyTally();
  let countedAll = 0;
  for (const r of records) {
    let row = byStudent.get(r.studentId);
    if (!row) {
      row = {
        studentId: r.studentId,
        name: `${r.student.person.firstName} ${r.student.person.lastName}`,
        admissionNumber: r.student.admissionNumber,
        section: `${r.session.section.gradeLevel.name} · ${r.session.section.name}`,
        campus: r.session.campus.name,
        tally: emptyTally(),
        pct: null,
        counted: 0,
      };
      byStudent.set(r.studentId, row);
    }
    addToTally(row.tally, r.code.category);
    addToTally(totals, r.code.category);
    if (r.code.countsAsPresent) {
      row.counted++;
      countedAll++;
    }
    if (!r.code.countsAsPresent || r.code.category === "LATE") {
      daily.push({
        date: r.session.date,
        section: row.section,
        student: row.name,
        admissionNumber: row.admissionNumber,
        code: r.code.code,
        label: r.code.label,
        category: r.code.category,
      });
    }
  }
  const students = [...byStudent.values()].map(({ counted, ...row }) => ({
    ...row,
    pct: attendancePct(counted, row.tally.total),
  }));
  students.sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.name.localeCompare(b.name));

  return {
    students,
    daily,
    sessions: new Set(records.map((r) => r.sessionId)).size,
    totals,
    overallPct: attendancePct(countedAll, totals.total),
  };
}
