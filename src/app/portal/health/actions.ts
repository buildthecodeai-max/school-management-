"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { clean, currentCampusOf } from "@/lib/restricted";

export interface HealthActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// health.record.write is intentionally NOT in the campus admin role.
export async function saveHealthRecord(_p: HealthActionState, f: FormData): Promise<HealthActionState> {
  const ctx = await requireUser();
  const student = await prisma.student.findFirst({ where: { id: clean(f.get("studentId"), 40), tenantId: ctx.tenantId! }, select: { id: true } });
  if (!student) return { error: "Student not found." };
  const existing = await prisma.healthRecord.findFirst({ where: { studentId: student.id, tenantId: ctx.tenantId! } });
  // The campus comes from the student's enrollment (or the existing record), never from the form.
  const campusId = (await currentCampusOf(ctx.tenantId!, student.id)) ?? existing?.campusId ?? null;
  if (!campusId) return { error: "This student is not enrolled on any campus." };
  if (!canForCampus(ctx, "health.record.write", campusId)) return { error: "You do not have permission to edit health records." };

  const fields = {
    allergies: clean(f.get("allergies"), 1000) || null,
    conditions: clean(f.get("conditions"), 1000) || null,
    emergencyContact: clean(f.get("emergencyContact"), 300) || null,
    notes: clean(f.get("notes"), 2000) || null,
  };
  const record = await prisma.healthRecord.upsert({
    where: { studentId: student.id },
    create: { tenantId: ctx.tenantId!, campusId, studentId: student.id, ...fields },
    update: { campusId, ...fields },
  });
  await audit({
    tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: existing ? "health.record.updated" : "health.record.created",
    targetType: "HealthRecord", targetId: record.id, campusId, scopeType: "CAMPUS",
    // Never copy the medical content into the audit log; only say which fields changed.
    metadata: { studentId: student.id, changed: (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => (existing?.[k] ?? null) !== fields[k]) },
  });
  revalidatePath(`/portal/health/${student.id}`);
  revalidatePath("/portal/health");
  return { ok: true, message: "Health record saved." };
}

export async function reportHealthIncident(_p: HealthActionState, f: FormData): Promise<HealthActionState> {
  const ctx = await requireUser();
  const record = await prisma.healthRecord.findFirst({ where: { id: clean(f.get("healthRecordId"), 40), tenantId: ctx.tenantId! } });
  if (!record) return { error: "Health record not found." };
  const campusId = record.campusId;
  if (!canForCampus(ctx, "health.incident.write", campusId)) return { error: "You do not have permission to report health incidents." };
  const description = clean(f.get("description"), 1500);
  if (description.length < 5) return { error: "Describe what happened (at least 5 characters)." };
  const when = new Date(clean(f.get("occurredAt"), 40));
  if (Number.isNaN(when.getTime())) return { error: "Enter when it happened." };
  if (when.getTime() > Date.now() + 5 * 60_000) return { error: "The incident cannot be in the future." };

  const incident = await prisma.healthIncident.create({
    data: { tenantId: ctx.tenantId!, campusId, healthRecordId: record.id, description, reportedByUserId: ctx.user.id, occurredAt: when },
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "health.incident.reported", targetType: "HealthIncident", targetId: incident.id, campusId, scopeType: "CAMPUS", metadata: { studentId: record.studentId } });
  revalidatePath(`/portal/health/${record.studentId}`);
  revalidatePath("/portal/health");
  return { ok: true, message: "Incident recorded." };
}
