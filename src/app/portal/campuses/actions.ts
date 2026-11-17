"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { checkLimit } from "@/lib/entitlements";

export interface CampusActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const lifecycleSchema = z.object({
  campusId: z.string().min(1),
  reason: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1, "Campus name is required."),
  code: z
    .string()
    .min(2, "Code must be at least 2 characters.")
    .max(12, "Code must be 12 characters or fewer.")
    .regex(/^[A-Z0-9-]+$/, "Code may only contain A-Z, 0-9 and hyphens."),
  city: z.string().optional(),
  addressLine: z.string().optional(),
  timezone: z.string().min(1),
});

export async function createCampus(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  const ctx = await requireUser();
  if (!can(ctx, "campus.write")) return { error: "Permission denied." };

  const parsed = createSchema.safeParse({
    name: String(formData.get("name") ?? "").trim(),
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    city: String(formData.get("city") ?? "").trim() || undefined,
    addressLine: String(formData.get("addressLine") ?? "").trim() || undefined,
    timezone: String(formData.get("timezone") ?? "").trim() || "UTC",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }

  const duplicate = await prisma.campus.findFirst({
    where: { tenantId: ctx.tenantId!, code: parsed.data.code },
  });
  if (duplicate) {
    return { error: `Code ${parsed.data.code} is already used by ${duplicate.name}.` };
  }

  const limitError = await checkLimit(ctx.tenantId!, "campuses");
  if (limitError) return { error: limitError };

  const campus = await prisma.campus.create({
    data: {
      tenantId: ctx.tenantId!,
      name: parsed.data.name,
      code: parsed.data.code,
      city: parsed.data.city,
      addressLine: parsed.data.addressLine,
      timezone: parsed.data.timezone,
      status: "ACTIVE",
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "campus.created",
    targetType: "Campus",
    targetId: campus.id,
    metadata: { name: campus.name, code: campus.code },
  });

  revalidatePath("/portal/campuses");
  return { ok: true, message: `${campus.name} created. Set up its academic year next.` };
}

const updateSchema = z.object({
  campusId: z.string().min(1),
  name: z.string().min(1, "Campus name is required."),
  city: z.string().optional(),
  addressLine: z.string().optional(),
  logoUrl: z.string().optional(),
});

export async function updateCampus(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  const ctx = await requireUser();
  if (!can(ctx, "campus.write")) return { error: "Permission denied." };

  const parsed = updateSchema.safeParse({
    campusId: formData.get("campusId"),
    name: String(formData.get("name") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim() || undefined,
    addressLine: String(formData.get("addressLine") ?? "").trim() || undefined,
    logoUrl: String(formData.get("logoUrl") ?? "").trim() || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid form data" };

  const campus = await prisma.campus.findFirst({
    where: { id: parsed.data.campusId, tenantId: ctx.tenantId! },
  });
  if (!campus) return { error: "Campus not found." };

  await prisma.campus.update({
    where: { id: campus.id },
    data: {
      name: parsed.data.name,
      city: parsed.data.city ?? null,
      addressLine: parsed.data.addressLine ?? null,
      logoUrl: parsed.data.logoUrl || null,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "campus.updated",
    targetType: "Campus",
    targetId: campus.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/portal/campuses");
  return { ok: true, message: `${parsed.data.name} updated.` };
}

// BRN-001..008: Campus lifecycle transitions with dependency guards.

export async function activateCampus(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  const ctx = await requireUser();
  if (!can(ctx, "campus.write")) return { error: "Permission denied." };

  const parsed = lifecycleSchema.safeParse({
    campusId: formData.get("campusId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid form data" };

  const campus = await prisma.campus.findFirst({
    where: { id: parsed.data.campusId, tenantId: ctx.tenantId! },
  });
  if (!campus) return { error: "Campus not found." };
  if (campus.status === "CLOSED") return { error: "Cannot reactivate a closed campus." };

  await prisma.campus.update({
    where: { id: campus.id },
    data: { status: "ACTIVE" },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "campus.activated",
    targetType: "Campus",
    targetId: campus.id,
    metadata: { reason: parsed.data.reason },
  });

  revalidatePath("/portal/campuses");
  return { ok: true, message: `${campus.name} is now active.` };
}

export async function suspendCampus(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  const ctx = await requireUser();
  if (!can(ctx, "campus.write")) return { error: "Permission denied." };

  const parsed = lifecycleSchema.safeParse({
    campusId: formData.get("campusId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid form data" };

  const campus = await prisma.campus.findFirst({
    where: { id: parsed.data.campusId, tenantId: ctx.tenantId! },
  });
  if (!campus) return { error: "Campus not found." };
  if (campus.status === "CLOSED") return { error: "Campus is already closed." };

  await prisma.campus.update({
    where: { id: campus.id },
    data: { status: "SUSPENDED" },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "campus.suspended",
    targetType: "Campus",
    targetId: campus.id,
    metadata: { reason: parsed.data.reason },
  });

  revalidatePath("/portal/campuses");
  return { ok: true, message: `${campus.name} suspended.` };
}

export async function closeCampus(
  _prev: CampusActionState,
  formData: FormData,
): Promise<CampusActionState> {
  const ctx = await requireUser();
  if (!can(ctx, "campus.write")) return { error: "Permission denied." };

  const parsed = lifecycleSchema.safeParse({
    campusId: formData.get("campusId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid form data" };

  const campus = await prisma.campus.findFirst({
    where: { id: parsed.data.campusId, tenantId: ctx.tenantId! },
    include: {
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!campus) return { error: "Campus not found." };

  // Dependency guard: cannot close a campus with active enrollments.
  if (campus._count.enrollments > 0) {
    return {
      error: `Cannot close ${campus.name}: ${campus._count.enrollments} active enrollment(s) remain. Transfer or withdraw all students first.`,
    };
  }

  await prisma.campus.update({
    where: { id: campus.id },
    data: { status: "CLOSED" },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "campus.closed",
    targetType: "Campus",
    targetId: campus.id,
    metadata: { reason: parsed.data.reason },
  });

  revalidatePath("/portal/campuses");
  return { ok: true, message: `${campus.name} has been closed.` };
}
