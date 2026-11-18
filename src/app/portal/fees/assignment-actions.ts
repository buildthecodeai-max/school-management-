"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canForCampus, requireUser } from "@/lib/rbac";

export interface AssignState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function parseDiscount(f: FormData): { pct?: number; reason?: string; error?: string } {
  const pct = Number(str(f, "discountPct") || 0);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return { error: "The discount must be a whole number from 0 to 100." };
  const reason = str(f, "discountReason");
  if (pct > 0 && !reason) return { error: "Give a reason for the discount (scholarship, sibling, hardship…)." };
  return { pct, reason: reason || undefined };
}

// Assigning a structure or a discount changes what a family is billed, so it
// needs fee.adjust on the structure's campus (a billing clerk cannot discount).
async function structureFor(id: string) {
  const ctx = await requireUser();
  const structure = ctx.tenantId ? await prisma.feeStructure.findFirst({ where: { id, tenantId: ctx.tenantId } }) : null;
  if (!structure || !canForCampus(ctx, "fee.adjust", structure.campusId)) return null;
  return { ctx, structure };
}

export async function assignFeeToStudent(_p: AssignState, f: FormData): Promise<AssignState> {
  const a = await structureFor(str(f, "feeStructureId"));
  if (!a) return { error: "You do not have permission to assign this fee structure." };
  const d = parseDiscount(f);
  if (d.error) return { error: d.error };
  const student = await prisma.student.findFirst({
    where: { tenantId: a.ctx.tenantId!, admissionNumber: { equals: str(f, "admissionNumber"), mode: "insensitive" } },
    include: { person: true, enrollments: { where: { status: "ACTIVE" } } },
  });
  if (!student) return { error: "No student with that admission number." };
  if (!student.enrollments.some((e) => e.campusId === a.structure.campusId))
    return { error: "That student is not actively enrolled on this fee structure's campus." };

  const before = await prisma.studentFeeAssignment.findUnique({ where: { studentId_feeStructureId: { studentId: student.id, feeStructureId: a.structure.id } } });
  await prisma.studentFeeAssignment.upsert({
    where: { studentId_feeStructureId: { studentId: student.id, feeStructureId: a.structure.id } },
    create: { tenantId: a.ctx.tenantId!, studentId: student.id, feeStructureId: a.structure.id, discountPct: d.pct!, discountReason: d.reason },
    update: { discountPct: d.pct!, discountReason: d.reason ?? null },
  });
  await audit({
    tenantId: a.ctx.tenantId,
    actorUserId: a.ctx.user.id,
    action: "fee.assignment.set",
    targetType: "Student",
    targetId: student.id,
    campusId: a.structure.campusId,
    scopeType: "CAMPUS",
    metadata: { structure: a.structure.name, discountPct: d.pct, reason: d.reason, previousDiscountPct: before?.discountPct ?? null },
  });
  revalidatePath("/portal/fees/assignments");
  return { ok: true, message: `${student.person.firstName} ${student.person.lastName} assigned to ${a.structure.name}${d.pct ? ` with ${d.pct}% off` : ""}.` };
}

// Whole section at once. "Preview" reports what would happen and changes nothing.
export async function bulkAssignFeeToSection(_p: AssignState, f: FormData): Promise<AssignState> {
  const a = await structureFor(str(f, "feeStructureId"));
  if (!a) return { error: "You do not have permission to assign this fee structure." };
  const d = parseDiscount(f);
  if (d.error) return { error: d.error };
  const section = await prisma.section.findFirst({ where: { id: str(f, "sectionId"), tenantId: a.ctx.tenantId!, campusId: a.structure.campusId } });
  if (!section) return { error: "Choose a section on the same campus as the fee structure." };

  const enrollments = await prisma.enrollment.findMany({ where: { sectionId: section.id, status: "ACTIVE", tenantId: a.ctx.tenantId! }, select: { studentId: true } });
  const ids = [...new Set(enrollments.map((e) => e.studentId))];
  const existing = new Set((await prisma.studentFeeAssignment.findMany({ where: { feeStructureId: a.structure.id, studentId: { in: ids } }, select: { studentId: true } })).map((x) => x.studentId));
  const fresh = ids.filter((id) => !existing.has(id));
  if (ids.length === 0) return { error: "That section has no active students." };

  if (str(f, "mode") === "preview")
    return { ok: true, message: `Preview: ${fresh.length} student(s) would be assigned ${a.structure.name}${d.pct ? ` with ${d.pct}% off` : ""}; ${existing.size} already assigned are left unchanged.` };

  if (fresh.length)
    await prisma.studentFeeAssignment.createMany({
      data: fresh.map((studentId) => ({ tenantId: a.ctx.tenantId!, studentId, feeStructureId: a.structure.id, discountPct: d.pct!, discountReason: d.reason })),
      skipDuplicates: true,
    });
  await audit({
    tenantId: a.ctx.tenantId,
    actorUserId: a.ctx.user.id,
    action: "fee.assignment.bulk",
    targetType: "Section",
    targetId: section.id,
    campusId: a.structure.campusId,
    scopeType: "CAMPUS",
    metadata: { structure: a.structure.name, assigned: fresh.length, skipped: existing.size, discountPct: d.pct, reason: d.reason },
  });
  revalidatePath("/portal/fees/assignments");
  return { ok: true, message: `Assigned ${fresh.length} student(s); ${existing.size} already had it.` };
}

export async function removeFeeAssignment(_p: AssignState, f: FormData): Promise<AssignState> {
  const ctx = await requireUser();
  const row = ctx.tenantId ? await prisma.studentFeeAssignment.findFirst({ where: { id: str(f, "id"), tenantId: ctx.tenantId }, include: { structure: true, student: { include: { person: true } } } }) : null;
  if (!row || !canForCampus(ctx, "fee.adjust", row.structure.campusId)) return { error: "You do not have permission to remove this assignment." };
  await prisma.studentFeeAssignment.delete({ where: { id: row.id } });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.assignment.removed",
    targetType: "Student",
    targetId: row.studentId,
    campusId: row.structure.campusId,
    scopeType: "CAMPUS",
    metadata: { structure: row.structure.name, discountPct: row.discountPct },
  });
  revalidatePath("/portal/fees/assignments");
  return { ok: true, message: "Assignment removed. Invoices already issued are unchanged." };
}
