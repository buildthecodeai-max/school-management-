"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export interface SafeguardingActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const caseSchema = z.object({
  campusId: z.string().min(1),
  studentId: z.string().min(1),
  title: z.string().min(1).max(300),
});

export async function openSafeguardingCase(
  _prev: SafeguardingActionState,
  formData: FormData,
): Promise<SafeguardingActionState> {
  const ctx = await requireUser();
  const parsed = caseSchema.safeParse({
    campusId: formData.get("campusId"),
    studentId: formData.get("studentId"),
    title: formData.get("title"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { campusId, studentId, title } = parsed.data;

  // safeguarding.case.write is NOT in any default role — deliberately narrow.
  if (!canForCampus(ctx, "safeguarding.case.write", campusId)) {
    return { error: "You do not have permission to open safeguarding cases." };
  }

  const safeCase = await prisma.safeguardingCase.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      studentId,
      title,
      status: "OPEN",
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "safeguarding.case.opened",
    targetType: "SafeguardingCase",
    targetId: safeCase.id,
    campusId,
    metadata: { studentId, title },
  });

  revalidatePath("/portal/safeguarding");
  return { ok: true, message: "Safeguarding case opened." };
}

const noteSchema = z.object({
  caseId: z.string().min(1),
  campusId: z.string().min(1),
  body: z.string().min(1),
});

export async function addSafeguardingNote(
  _prev: SafeguardingActionState,
  formData: FormData,
): Promise<SafeguardingActionState> {
  const ctx = await requireUser();
  const parsed = noteSchema.safeParse({
    caseId: formData.get("caseId"),
    campusId: formData.get("campusId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { caseId, campusId, body } = parsed.data;

  if (!canForCampus(ctx, "safeguarding.case.write", campusId)) {
    return { error: "Permission denied." };
  }

  await prisma.safeguardingNote.create({
    data: {
      tenantId: ctx.tenantId!,
      caseId,
      authorUserId: ctx.user.id,
      body,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "safeguarding.note.added",
    targetType: "SafeguardingCase",
    targetId: caseId,
    campusId,
    metadata: {},
  });

  revalidatePath("/portal/safeguarding");
  return { ok: true, message: "Note added." };
}

export async function closeSafeguardingCase(
  _prev: SafeguardingActionState,
  formData: FormData,
): Promise<SafeguardingActionState> {
  const ctx = await requireUser();
  const caseId = String(formData.get("caseId") ?? "");
  const campusId = String(formData.get("campusId") ?? "");
  if (!canForCampus(ctx, "safeguarding.case.write", campusId)) return { error: "Permission denied." };

  await prisma.safeguardingCase.update({
    where: { id: caseId },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "safeguarding.case.closed",
    targetType: "SafeguardingCase",
    targetId: caseId,
    campusId,
    metadata: {},
  });

  revalidatePath("/portal/safeguarding");
  return { ok: true, message: "Case closed." };
}
