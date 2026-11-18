import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { audit } from "./audit";

// ADM-006: merge a duplicate student record (the "duplicate") into the record
// to keep. Everything hanging off the duplicate is re-pointed to the keeper.
// Where a unique constraint means both already hold the same item (same
// session attendance, same exam seat, ...) the KEEPER's row wins and the
// duplicate's is discarded. The duplicate's person row is soft-deleted.

type Tx = Prisma.TransactionClient;

interface Linked {
  label: string;
  count: (db: Tx | typeof prisma, studentId: string) => Promise<number>;
}

const w = (studentId: string) => ({ where: { studentId } });

const LINKED: Linked[] = [
  { label: "Enrollments", count: (d, s) => d.enrollment.count(w(s)) },
  { label: "Guardian links", count: (d, s) => d.guardianRelationship.count(w(s)) },
  { label: "Attendance records", count: (d, s) => d.attendanceRecord.count(w(s)) },
  { label: "Fee assignments", count: (d, s) => d.studentFeeAssignment.count(w(s)) },
  { label: "Invoices", count: (d, s) => d.invoice.count(w(s)) },
  { label: "Payments", count: (d, s) => d.payment.count(w(s)) },
  { label: "Refunds", count: (d, s) => d.refund.count(w(s)) },
  { label: "Payment plans", count: (d, s) => d.paymentPlan.count(w(s)) },
  { label: "Mark entries", count: (d, s) => d.markEntry.count(w(s)) },
  { label: "Results", count: (d, s) => d.studentResult.count(w(s)) },
  { label: "Documents", count: (d, s) => d.studentDocument.count(w(s)) },
  { label: "Exam seats", count: (d, s) => d.seatAssignment.count(w(s)) },
  { label: "Certificates", count: (d, s) => d.certificateIssue.count(w(s)) },
  { label: "ID cards", count: (d, s) => d.studentIdCard.count(w(s)) },
  { label: "Hostel assignments", count: (d, s) => d.hostelAssignment.count(w(s)) },
  { label: "Transport assignments", count: (d, s) => d.routeAssignment.count(w(s)) },
  { label: "Health record", count: (d, s) => d.healthRecord.count(w(s)) },
  { label: "Safeguarding cases", count: (d, s) => d.safeguardingCase.count(w(s)) },
  { label: "Application conversions", count: (d, s) => d.enrollmentConversion.count(w(s)) },
];

export interface MergePreview {
  keep: { id: string; name: string; admissionNumber: string };
  drop: { id: string; name: string; admissionNumber: string };
  moving: { label: string; count: number }[];
  blockers: string[];
}

export class MergeError extends Error {}

async function loadPair(db: Tx | typeof prisma, tenantId: string, keepId: string, dropId: string) {
  if (keepId === dropId) throw new MergeError("Choose two different student records.");
  const [keep, drop] = await Promise.all(
    [keepId, dropId].map((id) =>
      db.student.findFirst({ where: { id, tenantId }, include: { person: true } }),
    ),
  );
  if (!keep || !drop) throw new MergeError("Student record not found.");
  return { keep, drop };
}

export async function previewStudentMerge(
  tenantId: string,
  keepId: string,
  dropId: string,
): Promise<MergePreview> {
  const { keep, drop } = await loadPair(prisma, tenantId, keepId, dropId);
  const label = (s: typeof keep) => ({
    id: s.id,
    name: `${s.person.firstName} ${s.person.lastName}`,
    admissionNumber: s.admissionNumber,
  });

  const moving = (
    await Promise.all(LINKED.map(async (l) => ({ label: l.label, count: await l.count(prisma, drop.id) })))
  ).filter((m) => m.count > 0);

  const blockers: string[] = [];
  const [keepActive, dropActive, keepHealth, dropHealth] = await Promise.all([
    prisma.enrollment.count({ where: { studentId: keep.id, status: "ACTIVE" } }),
    prisma.enrollment.count({ where: { studentId: drop.id, status: "ACTIVE" } }),
    prisma.healthRecord.count({ where: { studentId: keep.id } }),
    prisma.healthRecord.count({ where: { studentId: drop.id } }),
  ]);
  if (keepActive > 0 && dropActive > 0)
    blockers.push("Both records have an active enrollment. Withdraw the duplicate's enrollment first.");
  if (keepHealth > 0 && dropHealth > 0)
    blockers.push("Both records have a health record. Reconcile them manually first; health data is never discarded automatically.");

  return { keep: label(keep), drop: label(drop), moving, blockers };
}

// Delete the duplicate's rows that would violate a unique key because the
// keeper already has the same item, then re-point the rest.
export async function mergeStudents(
  tenantId: string,
  keepId: string,
  dropId: string,
  actorUserId: string,
  reason: string,
): Promise<MergePreview> {
  const preview = await previewStudentMerge(tenantId, keepId, dropId);
  if (preview.blockers.length) throw new MergeError(preview.blockers[0]);

  let discarded = 0;
  await prisma.$transaction(
    async (tx) => {
      const del = async (n: Promise<{ count: number }>) => {
        discarded += (await n).count;
      };
      const move = { where: { studentId: dropId }, data: { studentId: keepId } };

      const gl = await tx.guardianRelationship.findMany({ where: { studentId: keepId }, select: { guardianId: true } });
      if (gl.length) await del(tx.guardianRelationship.deleteMany({ where: { studentId: dropId, guardianId: { in: gl.map((x) => x.guardianId) } } }));

      const att = await tx.attendanceRecord.findMany({ where: { studentId: keepId }, select: { sessionId: true } });
      if (att.length) await del(tx.attendanceRecord.deleteMany({ where: { studentId: dropId, sessionId: { in: att.map((x) => x.sessionId) } } }));

      const fa = await tx.studentFeeAssignment.findMany({ where: { studentId: keepId }, select: { feeStructureId: true } });
      if (fa.length) await del(tx.studentFeeAssignment.deleteMany({ where: { studentId: dropId, feeStructureId: { in: fa.map((x) => x.feeStructureId) } } }));

      const me = await tx.markEntry.findMany({ where: { studentId: keepId }, select: { subjectId: true, componentId: true } });
      if (me.length) await del(tx.markEntry.deleteMany({ where: { studentId: dropId, OR: me } }));

      const seats = await tx.seatAssignment.findMany({ where: { studentId: keepId }, select: { examScheduleId: true } });
      if (seats.length) await del(tx.seatAssignment.deleteMany({ where: { studentId: dropId, examScheduleId: { in: seats.map((x) => x.examScheduleId) } } }));

      const cards = await tx.studentIdCard.findMany({ where: { studentId: keepId }, select: { academicYearId: true } });
      if (cards.length) await del(tx.studentIdCard.deleteMany({ where: { studentId: dropId, academicYearId: { in: cards.map((x) => x.academicYearId) } } }));

      await tx.enrollment.updateMany(move);
      await tx.guardianRelationship.updateMany(move);
      await tx.attendanceRecord.updateMany(move);
      await tx.studentFeeAssignment.updateMany(move);
      await tx.invoice.updateMany(move);
      await tx.payment.updateMany(move);
      await tx.refund.updateMany(move);
      await tx.paymentPlan.updateMany(move);
      await tx.markEntry.updateMany(move);
      await tx.studentResult.updateMany(move);
      await tx.studentDocument.updateMany(move);
      await tx.seatAssignment.updateMany(move);
      await tx.certificateIssue.updateMany(move);
      await tx.studentIdCard.updateMany(move);
      await tx.hostelAssignment.updateMany(move);
      await tx.routeAssignment.updateMany(move);
      await tx.healthRecord.updateMany(move);
      await tx.safeguardingCase.updateMany(move);
      await tx.enrollmentConversion.updateMany(move);

      // The Student delete cascades, so prove nothing is left to be lost.
      for (const l of LINKED) {
        if ((await l.count(tx, dropId)) > 0) throw new MergeError(`Merge aborted: ${l.label} could not be moved.`);
      }

      const { personId } = await tx.student.findUniqueOrThrow({ where: { id: dropId }, select: { personId: true } });
      await tx.student.delete({ where: { id: dropId } });
      await tx.person.update({ where: { id: personId }, data: { deletedAt: new Date() } });
    },
    { timeout: 30_000 },
  );

  await audit({
    tenantId,
    actorUserId,
    action: "student.merge",
    targetType: "Student",
    targetId: keepId,
    scopeType: "ORG",
    metadata: {
      reason,
      kept: preview.keep,
      mergedAway: preview.drop,
      moved: preview.moving,
      discardedDuplicates: discarded,
    },
  });
  return preview;
}
