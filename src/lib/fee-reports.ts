import "server-only";
import { prisma } from "./db";
import { agingBucket, daysOverdue, sumBy, localDayKey } from "./fee-report-calc";
import { dayStart, dayEnd } from "./dates";

type Scope = { tenantId: string; campusIds: string[] | null; campusId?: string };

function campusWhere(s: Scope): { campusId?: string | { in: string[] } } {
  if (s.campusId) return { campusId: s.campusId };
  return s.campusIds ? { campusId: { in: s.campusIds } } : {};
}

export async function collectionsReport(s: Scope & { from: Date; to: Date; method?: string }) {
  const payments = await prisma.payment.findMany({
    where: { tenantId: s.tenantId, status: "CONFIRMED", receivedAt: { gte: dayStart(s.from), lte: dayEnd(s.to) }, ...(s.method ? { method: s.method as never } : {}), ...campusWhere(s) },
    include: { student: { include: { person: true } }},
    orderBy: { receivedAt: "asc" },
    take: 5000,
  });
  const total = payments.reduce((t, p) => t + p.amount, 0);
  return {
    rows: payments,
    total,
    byMethod: sumBy(payments, (p) => p.method, (p) => p.amount),
    byDay: sumBy(payments, (p) => localDayKey(p.receivedAt), (p) => p.amount),
    truncated: payments.length === 5000,
  };
}

export async function outstandingReport(s: Scope & { gradeLevelId?: string; asOf: Date }) {
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId: s.tenantId,
      status: { in: ["OPEN", "PARTIAL"] },
      balance: { gt: 0 },
      ...campusWhere(s),
      ...(s.gradeLevelId ? { student: { enrollments: { some: { gradeLevelId: s.gradeLevelId, status: "ACTIVE" } } } } : {}),
    },
    include: { student: { include: { person: true } }},
    orderBy: { dueDate: "asc" },
    take: 5000,
  });
  const rows = invoices.map((i) => ({ ...i, bucket: agingBucket(i.dueDate, s.asOf), overdueDays: Math.max(0, daysOverdue(i.dueDate, s.asOf)) }));
  return {
    rows,
    total: rows.reduce((t, r) => t + r.balance, 0),
    overdueTotal: rows.filter((r) => r.overdueDays > 0).reduce((t, r) => t + r.balance, 0),
    byBucket: sumBy(rows, (r) => r.bucket, (r) => r.balance),
    truncated: invoices.length === 5000,
  };
}

export async function discountsReport(s: Scope & { from: Date; to: Date }) {
  const notes = await prisma.creditNote.findMany({
    where: { tenantId: s.tenantId, createdAt: { gte: dayStart(s.from), lte: dayEnd(s.to) }, invoice: { ...campusWhere(s) } },
    include: { invoice: { include: { student: { include: { person: true } }} } },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  return { rows: notes, total: notes.reduce((t, n) => t + n.amount, 0) };
}

export async function refundsReport(s: Scope & { from: Date; to: Date }) {
  // Refund has no campus of its own: scope it through the student's enrollment.
  const effective = s.campusId ? [s.campusId] : s.campusIds;
  const scoped = effective
    ? await prisma.enrollment.findMany({ where: { tenantId: s.tenantId, campusId: { in: effective } }, select: { studentId: true } })
    : null;
  const refunds = await prisma.refund.findMany({
    where: {
      tenantId: s.tenantId,
      createdAt: { gte: dayStart(s.from), lte: dayEnd(s.to) },
      ...(scoped ? { studentId: { in: scoped.map((e) => e.studentId) } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 5000,
  });
  const students = await prisma.student.findMany({ where: { tenantId: s.tenantId, id: { in: [...new Set(refunds.map((r) => r.studentId))] } }, include: { person: true } });
  const nameOf = new Map(students.map((x) => [x.id, { name: `${x.person.firstName} ${x.person.lastName}`, admissionNumber: x.admissionNumber }]));
  const rows = refunds.map((r) => ({ ...r, student: nameOf.get(r.studentId) ?? { name: "—", admissionNumber: "" } }));
  return { rows, total: refunds.reduce((t, r) => t + r.amount, 0), byMethod: sumBy(refunds, (r) => r.method, (r) => r.amount) };
}

export async function campusNames(tenantId: string): Promise<Map<string, string>> {
  const c = await prisma.campus.findMany({ where: { tenantId }, select: { id: true, name: true } });
  return new Map(c.map((x) => [x.id, x.name]));
}
