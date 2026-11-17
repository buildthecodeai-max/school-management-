"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface HealthActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const recordSchema = z.object({
  campusId: z.string().min(1),
  studentId: z.string().min(1),
  allergies: z.string().optional(),
  conditions: z.string().optional(),
  emergencyContact: z.string().optional(),
  notes: z.string().optional(),
});

export async function upsertHealthRecord(
  _prev: HealthActionState,
  formData: FormData,
): Promise<HealthActionState> {
  const ctx = await requireUser();
  const parsed = recordSchema.safeParse({
    campusId: formData.get("campusId"),
    studentId: formData.get("studentId"),
    allergies: formData.get("allergies"),
    conditions: formData.get("conditions"),
    emergencyContact: formData.get("emergencyContact"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { campusId, studentId, ...fields } = parsed.data;

  // health.record.write is intentionally NOT in campusAdminRole — see schema comment.
  if (!canForCampus(ctx, "health.record.write", campusId)) {
    return { error: "You do not have permission to access health records." };
  }

  const record = await prisma.healthRecord.upsert({
    where: { studentId },
    create: { tenantId: ctx.tenantId!, campusId, studentId, ...fields },
    update: { ...fields },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "health.record.upserted",
    targetType: "HealthRecord",
    targetId: record.id,
    campusId,
    metadata: { studentId },
  });

  revalidatePath("/portal/health");
  return { ok: true, message: "Health record saved." };
}

const incidentSchema = z.object({
  campusId: z.string().min(1),
  healthRecordId: z.string().min(1),
  description: z.string().min(1),
  occurredAt: z.string().min(1),
});

export async function reportHealthIncident(
  _prev: HealthActionState,
  formData: FormData,
): Promise<HealthActionState> {
  const ctx = await requireUser();
  const parsed = incidentSchema.safeParse({
    campusId: formData.get("campusId"),
    healthRecordId: formData.get("healthRecordId"),
    description: formData.get("description"),
    occurredAt: formData.get("occurredAt"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { campusId, healthRecordId, description, occurredAt } = parsed.data;

  if (!canForCampus(ctx, "health.incident.write", campusId)) {
    return { error: "You do not have permission to report health incidents." };
  }

  const incident = await prisma.healthIncident.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      healthRecordId,
      description,
      reportedByUserId: ctx.user.id,
      occurredAt: new Date(occurredAt),
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "health.incident.reported",
    targetType: "HealthIncident",
    targetId: incident.id,
    campusId,
    metadata: { healthRecordId, description: description.slice(0, 80) },
  });

  revalidatePath("/portal/health");
  return { ok: true, message: "Health incident reported." };
}
