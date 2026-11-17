"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, assertPermission } from "@/lib/rbac";
import { startImpersonation } from "@/lib/auth";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { syncSeats, checkLimit } from "@/lib/entitlements";
import { z } from "zod";
import { ALL_PERMISSIONS } from "@/lib/permissions";

export async function ensureSchoolRoles(form: FormData) {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");
  const tenantId = String(form.get("tenantId") ?? "");
  if (!(await prisma.tenant.findUnique({ where: { id: tenantId } }))) throw new Error("School not found.");
  const tenantPermissions = ALL_PERMISSIONS.filter(p => !p.startsWith("platform."));
  const definitions: Record<string, string[]> = {
    "Organization Owner": tenantPermissions,
    "Campus Administrator": tenantPermissions.filter(p => !p.startsWith("billing.") && !p.startsWith("health.") && !p.startsWith("safeguarding.")),
    "Admissions Officer": tenantPermissions.filter(p => p.startsWith("admissions.") || ["student.read", "guardian.read", "campus.read", "message.read"].includes(p)),
    "Finance Officer": tenantPermissions.filter(p => p.startsWith("fee.") && p !== "fee.adjust" || ["student.read", "campus.read", "message.read"].includes(p)),
    "Teacher": ["student.read", "academics.read", "attendance.read", "attendance.write", "exams.read", "exams.enter", "timetable.read", "campus.read", "message.read"],
    "Parent / Guardian": ["message.read"],
  };
  await prisma.$transaction(async tx => {
    for (const [name, permissions] of Object.entries(definitions)) {
      if (!(await tx.role.findFirst({ where: { tenantId, name } }))) await tx.role.create({ data: { tenantId, name, permissions } });
    }
  });
  await audit({ tenantId, actorUserId: ctx.user.id, action: "platform.roles.initialized", scopeType: "PLATFORM" });
  revalidatePath(`/portal/platform/tenants/${tenantId}`);
}

export async function platformEditUser(_prev: TenantActionState, form: FormData): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");
  const userId = String(form.get("userId") ?? "");
  const displayName = String(form.get("displayName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!displayName || !z.string().email().safeParse(email).success) return { error: "Enter a name and valid email." };
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.tenantId || user.isPlatformStaff) return { error: "School user not found." };
  if (await prisma.user.findFirst({ where: { email, id: { not: userId } } })) return { error: "Email is already in use." };
  await prisma.user.update({ where: { id: userId }, data: { displayName, email } });
  await audit({ tenantId: user.tenantId, actorUserId: ctx.user.id, action: "platform.user.updated", targetId: userId, targetType: "User", scopeType: "PLATFORM", metadata: { before: { displayName: user.displayName, email: user.email }, after: { displayName, email } } });
  revalidatePath(`/portal/platform/tenants/${user.tenantId}`);
  return { ok: true, message: "User updated." };
}

export interface TenantActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const TENANT_STATUSES = ["TRIAL", "ACTIVE", "SUSPENDED", "CLOSED"] as const;
type TenantStatus = (typeof TENANT_STATUSES)[number];

// One-click status change from the tenant list row — no need to open the
// detail page for the single most common platform-ops action. Same
// authorization and audit trail as the full edit form, just fewer fields.
export async function quickSetTenantStatus(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const tenantId = String(formData.get("tenantId") ?? "");
  const status = String(formData.get("status") ?? "") as TenantStatus;
  if (!TENANT_STATUSES.includes(status)) return { error: "Invalid status." };

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { error: "Tenant not found." };

  await prisma.tenant.update({ where: { id: tenantId }, data: { status } });

  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "platform.tenant.updated",
    targetType: "Tenant",
    targetId: tenantId,
    scopeType: "PLATFORM",
    metadata: { from: { status: tenant.status }, to: { status } },
  });

  revalidatePath("/portal/platform");
  revalidatePath(`/portal/platform/tenants/${tenantId}`);
  return { ok: true, message: `${tenant.name} is now ${status}.` };
}

const createCampusSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1, "Campus name is required."),
  code: z
    .string()
    .min(2, "Code must be at least 2 characters.")
    .max(12, "Code must be 12 characters or fewer.")
    .regex(/^[A-Z0-9-]+$/, "Code may only contain A-Z, 0-9 and hyphens."),
  city: z.string().optional(),
  timezone: z.string().min(1),
});

// Lets a platform operator add a campus to any tenant directly, instead of
// having to impersonate an org owner for what is otherwise routine setup work.
// Same validation and plan-limit check as the tenant-side createCampus action
// in src/app/portal/campuses/actions.ts.
export async function platformCreateCampus(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const parsed = createCampusSchema.safeParse({
    tenantId: formData.get("tenantId"),
    name: String(formData.get("name") ?? "").trim(),
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    city: String(formData.get("city") ?? "").trim() || undefined,
    timezone: String(formData.get("timezone") ?? "").trim() || "UTC",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }
  const { tenantId, name, code, city, timezone } = parsed.data;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) return { error: "Tenant not found." };

  const duplicate = await prisma.campus.findFirst({ where: { tenantId, code } });
  if (duplicate) {
    return { error: `Code ${code} is already used by ${duplicate.name}.` };
  }

  const limitError = await checkLimit(tenantId, "campuses");
  if (limitError) return { error: limitError };

  const campus = await prisma.campus.create({
    data: { tenantId, name, code, city, timezone, status: "ACTIVE" },
  });

  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "campus.created",
    targetType: "Campus",
    targetId: campus.id,
    scopeType: "PLATFORM",
    metadata: { name: campus.name, code: campus.code, createdByPlatformStaff: true },
  });

  revalidatePath(`/portal/platform/tenants/${tenantId}`);
  return { ok: true, message: `${campus.name} created for ${tenant.name}.` };
}

export async function updateTenant(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const tenantId = String(formData.get("tenantId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "") as TenantStatus;
  const planId = String(formData.get("planId") ?? "").trim();

  if (!tenantId) return { error: "Missing tenant." };
  if (!name) return { error: "Organization name is required." };
  if (!TENANT_STATUSES.includes(status)) return { error: "Invalid status." };

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: true },
  });
  if (!tenant) return { error: "Tenant not found." };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { name, status },
  });

  if (planId && tenant.subscription && planId !== tenant.subscription.planId) {
    await prisma.subscription.update({
      where: { id: tenant.subscription.id },
      data: { planId },
    });
  }

  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "platform.tenant.updated",
    targetType: "Tenant",
    targetId: tenantId,
    scopeType: "PLATFORM",
    metadata: {
      from: { name: tenant.name, status: tenant.status },
      to: { name, status },
    },
  });

  revalidatePath("/portal/platform");
  revalidatePath(`/portal/platform/tenants/${tenantId}`);
  return { ok: true, message: `${name} updated.` };
}

const SUBSCRIPTION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
] as const;

export async function updateSubscription(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const tenantId = String(formData.get("tenantId") ?? "");
  const status = String(formData.get("status") ?? "");
  const trialEndsAt = String(formData.get("trialEndsAt") ?? "").trim();
  const currentPeriodEnd = String(formData.get("currentPeriodEnd") ?? "").trim();

  if (!SUBSCRIPTION_STATUSES.includes(status as (typeof SUBSCRIPTION_STATUSES)[number]))
    return { error: "Invalid subscription status." };

  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) return { error: "This tenant has no subscription." };

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: status as (typeof SUBSCRIPTION_STATUSES)[number],
      trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null,
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd) : null,
    },
  });
  await syncSeats(tenantId);

  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "platform.subscription.updated",
    targetType: "Subscription",
    targetId: subscription.id,
    scopeType: "PLATFORM",
    metadata: { status, trialEndsAt, currentPeriodEnd },
  });

  revalidatePath(`/portal/platform/tenants/${tenantId}`);
  return { ok: true, message: "Subscription updated." };
}

export async function setUserStatus(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "ACTIVE" && status !== "DISABLED")
    return { error: "Status must be ACTIVE or DISABLED." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found." };
  if (target.isPlatformStaff)
    return { error: "Platform staff accounts cannot be changed from here." };

  await prisma.user.update({ where: { id: userId }, data: { status } });

  // Disabling must also cut live sessions, or the user keeps working until
  // their cookie happens to expire.
  if (status === "DISABLED") {
    await prisma.session.deleteMany({ where: { userId } });
  }
  if (target.tenantId) await syncSeats(target.tenantId);

  await audit({
    tenantId: target.tenantId,
    actorUserId: ctx.user.id,
    action: status === "ACTIVE" ? "platform.user.enabled" : "platform.user.disabled",
    targetType: "User",
    targetId: userId,
    scopeType: "PLATFORM",
    metadata: { email: target.email },
  });

  revalidatePath(`/portal/platform/tenants/${target.tenantId}`);
  return {
    ok: true,
    message:
      status === "ACTIVE"
        ? `${target.displayName} re-enabled.`
        : `${target.displayName} disabled and signed out.`,
  };
}

export async function resetUserPassword(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const userId = String(formData.get("userId") ?? "");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "User not found." };
  if (target.isPlatformStaff)
    return { error: "Platform staff passwords cannot be reset from here." };

  const { hashPassword } = await import("@/lib/auth");
  const temporary = `Reset-${randomBytes(6).toString("base64url")}`;

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(temporary), passwordChangedAt: new Date() },
  });
  await prisma.session.deleteMany({ where: { userId } });

  await audit({
    tenantId: target.tenantId,
    actorUserId: ctx.user.id,
    action: "platform.user.password_reset",
    targetType: "User",
    targetId: userId,
    scopeType: "PLATFORM",
    metadata: { email: target.email },
  });

  revalidatePath(`/portal/platform/tenants/${target.tenantId}`);
  return {
    ok: true,
    message: `Temporary password for ${target.email}: ${temporary} — shown once, give it to them directly.`,
  };
}

export async function createPlan(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const priceMonthly = Number(formData.get("priceMonthly"));
  const maxStudents = Number(formData.get("maxStudents"));
  const maxCampuses = Number(formData.get("maxCampuses"));

  if (!name) return { error: "Plan name is required." };
  if (!code) return { error: "Plan code is required." };
  if (!Number.isFinite(priceMonthly) || priceMonthly < 0)
    return { error: "Monthly price must be zero or more." };
  if (!Number.isInteger(maxStudents) || maxStudents < 1)
    return { error: "Student limit must be at least 1." };
  if (!Number.isInteger(maxCampuses) || maxCampuses < 1)
    return { error: "Campus limit must be at least 1." };

  const clash = await prisma.plan.findUnique({ where: { code } });
  if (clash) return { error: `Plan code "${code}" already exists.` };

  const plan = await prisma.plan.create({
    data: {
      name,
      code,
      priceMonthly: Math.round(priceMonthly * 100),
      maxStudents,
      maxCampuses,
      isActive: true,
    },
  });

  await audit({
    tenantId: null,
    actorUserId: ctx.user.id,
    action: "platform.plan.created",
    targetType: "Plan",
    targetId: plan.id,
    scopeType: "PLATFORM",
    metadata: { name, code },
  });

  revalidatePath("/portal/platform/plans");
  return { ok: true, message: `${name} created.` };
}

export async function deletePlan(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const planId = String(formData.get("planId") ?? "");
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { _count: { select: { subscriptions: true } } },
  });
  if (!plan) return { error: "Plan not found." };

  // Subscriptions reference plans without a cascade, so deleting a plan in use
  // would orphan the tenants on it.
  if (plan._count.subscriptions > 0) {
    return {
      error: `${plan.name} has ${plan._count.subscriptions} subscriber(s). Move them to another plan first, or just untick "available for new subscriptions".`,
    };
  }

  await prisma.plan.delete({ where: { id: planId } });

  await audit({
    tenantId: null,
    actorUserId: ctx.user.id,
    action: "platform.plan.deleted",
    targetType: "Plan",
    targetId: planId,
    scopeType: "PLATFORM",
    metadata: { name: plan.name, code: plan.code },
  });

  revalidatePath("/portal/platform/plans");
  return { ok: true, message: `${plan.name} deleted.` };
}

export async function updatePlan(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const planId = String(formData.get("planId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const priceMonthly = Number(formData.get("priceMonthly"));
  const maxStudents = Number(formData.get("maxStudents"));
  const maxCampuses = Number(formData.get("maxCampuses"));
  const isActive = formData.get("isActive") === "on";

  if (!planId) return { error: "Missing plan." };
  if (!name) return { error: "Plan name is required." };
  if (!Number.isFinite(priceMonthly) || priceMonthly < 0)
    return { error: "Monthly price must be zero or more." };
  if (!Number.isInteger(maxStudents) || maxStudents < 1)
    return { error: "Student limit must be at least 1." };
  if (!Number.isInteger(maxCampuses) || maxCampuses < 1)
    return { error: "Campus limit must be at least 1." };

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) return { error: "Plan not found." };

  await prisma.plan.update({
    where: { id: planId },
    data: {
      name,
      priceMonthly: Math.round(priceMonthly * 100),
      maxStudents,
      maxCampuses,
      isActive,
    },
  });

  await audit({
    tenantId: null,
    actorUserId: ctx.user.id,
    action: "platform.plan.updated",
    targetType: "Plan",
    targetId: planId,
    scopeType: "PLATFORM",
    metadata: {
      from: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        maxStudents: plan.maxStudents,
        maxCampuses: plan.maxCampuses,
        isActive: plan.isActive,
      },
      to: { name, priceMonthly: Math.round(priceMonthly * 100), maxStudents, maxCampuses, isActive },
    },
  });

  revalidatePath("/portal/platform/plans");
  return { ok: true, message: `${name} saved.` };
}

// Hard delete cascades to campuses, users, roles, people and academic years.
// Guarded twice: the tenant must already be CLOSED, and the operator must
// retype the slug. CLOSED is the reversible soft-delete; this is not.
export async function deleteTenant(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const tenantId = String(formData.get("tenantId") ?? "");
  const confirmSlug = String(formData.get("confirmSlug") ?? "").trim();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { _count: { select: { campuses: true, users: true } } },
  });
  if (!tenant) return { error: "Tenant not found." };

  if (tenant.status !== "CLOSED") {
    return {
      error: `Set ${tenant.name} to CLOSED before deleting. Closing is reversible; deletion is not.`,
    };
  }
  if (confirmSlug !== tenant.slug) {
    return { error: `Type "${tenant.slug}" exactly to confirm deletion.` };
  }

  await audit({
    tenantId: null,
    actorUserId: ctx.user.id,
    action: "platform.tenant.deleted",
    targetType: "Tenant",
    targetId: tenantId,
    scopeType: "PLATFORM",
    metadata: {
      name: tenant.name,
      slug: tenant.slug,
      campuses: tenant._count.campuses,
      users: tenant._count.users,
    },
  });

  await prisma.tenant.delete({ where: { id: tenantId } });

  revalidatePath("/portal/platform");
  redirect("/portal/platform");
}

// IAM-004: platform-staff-only, session-swapping impersonation. The actor's
// own session is preserved (see lib/auth.ts::startImpersonation) and both
// the start and end are recorded in the immutable audit trail with the true
// actor's id, distinct from the user being viewed.
const CAMPUS_STATUSES = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;

const updateCampusSchema = z.object({
  campusId: z.string().min(1),
  name: z.string().min(1, "Campus name is required."),
  code: z
    .string()
    .min(2, "Code must be at least 2 characters.")
    .max(12, "Code must be 12 characters or fewer.")
    .regex(/^[A-Z0-9-]+$/, "Code may only contain A-Z, 0-9 and hyphens."),
  city: z.string().optional(),
  timezone: z.string().min(1),
});

// Full campus CRUD from the platform console, mirroring
// src/app/portal/campuses/actions.ts but scoped by an explicit tenantId
// (looked up from the campus itself) instead of the caller's own tenant,
// since platform staff have none.
export async function platformUpdateCampus(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const parsed = updateCampusSchema.safeParse({
    campusId: formData.get("campusId"),
    name: String(formData.get("name") ?? "").trim(),
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    city: String(formData.get("city") ?? "").trim() || undefined,
    timezone: String(formData.get("timezone") ?? "").trim() || "UTC",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }
  const { campusId, name, code, city, timezone } = parsed.data;

  const campus = await prisma.campus.findUnique({ where: { id: campusId } });
  if (!campus) return { error: "Campus not found." };

  const duplicate = await prisma.campus.findFirst({
    where: { tenantId: campus.tenantId, code, id: { not: campusId } },
  });
  if (duplicate) return { error: `Code ${code} is already used by ${duplicate.name}.` };

  await prisma.campus.update({
    where: { id: campusId },
    data: { name, code, city, timezone },
  });

  await audit({
    tenantId: campus.tenantId,
    actorUserId: ctx.user.id,
    action: "campus.updated",
    targetType: "Campus",
    targetId: campusId,
    campusId,
    scopeType: "PLATFORM",
    metadata: {
      from: { name: campus.name, code: campus.code, city: campus.city, timezone: campus.timezone },
      to: { name, code, city, timezone },
    },
  });

  revalidatePath(`/portal/platform/tenants/${campus.tenantId}`);
  return { ok: true, message: `${name} updated.` };
}

export async function platformSetCampusStatus(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const campusId = String(formData.get("campusId") ?? "");
  const status = String(formData.get("status") ?? "") as (typeof CAMPUS_STATUSES)[number];
  if (!CAMPUS_STATUSES.includes(status)) return { error: "Invalid status." };

  const campus = await prisma.campus.findUnique({
    where: { id: campusId },
    include: { _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
  });
  if (!campus) return { error: "Campus not found." };

  if (status === "CLOSED" && campus._count.enrollments > 0) {
    return {
      error: `Cannot close ${campus.name}: ${campus._count.enrollments} active enrollment(s) remain. Transfer or withdraw all students first.`,
    };
  }
  if (status === "ACTIVE" && campus.status === "CLOSED") {
    return { error: "Cannot reactivate a closed campus." };
  }

  await prisma.campus.update({ where: { id: campusId }, data: { status } });

  await audit({
    tenantId: campus.tenantId,
    actorUserId: ctx.user.id,
    action: `campus.${status.toLowerCase()}`,
    targetType: "Campus",
    targetId: campusId,
    campusId,
    scopeType: "PLATFORM",
    metadata: { from: campus.status, to: status },
  });

  revalidatePath(`/portal/platform/tenants/${campus.tenantId}`);
  return { ok: true, message: `${campus.name} is now ${status.toLowerCase()}.` };
}

const createUserSchema = z.object({
  tenantId: z.string().min(1),
  email: z.string().email("Enter a valid email address."),
  displayName: z.string().min(1, "Name is required."),
  roleId: z.string().min(1, "Choose a role."),
  scopeType: z.enum(["ORG", "CAMPUS"]),
  campusId: z.string().optional(),
});

// Creates a user directly in a school and grants their first role, so a
// platform operator can stand up an administrator without impersonating
// anyone. A one-time temporary password is returned in the confirmation
// message, mirroring resetUserPassword.
export async function platformCreateUser(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const parsed = createUserSchema.safeParse({
    tenantId: formData.get("tenantId"),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    displayName: String(formData.get("displayName") ?? "").trim(),
    roleId: formData.get("roleId"),
    scopeType: formData.get("scopeType"),
    campusId: String(formData.get("campusId") ?? "") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form data" };
  }
  const { tenantId, email, displayName, roleId, scopeType, campusId } = parsed.data;

  if (scopeType === "CAMPUS" && !campusId) {
    return { error: "Choose a campus for a campus-scoped role." };
  }

  const [tenant, role, existing] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId } }),
    // Deliberately excludes tenantId: null — that's reserved for system
    // roles like the platform "*" wildcard, which must never be grantable
    // to a tenant user.
    prisma.role.findFirst({ where: { id: roleId, tenantId } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (!tenant) return { error: "Tenant not found." };
  if (!role) return { error: "Role not found for this tenant." };
  if (existing) return { error: `${email} is already in use.` };

  if (scopeType === "CAMPUS") {
    const campus = await prisma.campus.findFirst({ where: { id: campusId, tenantId } });
    if (!campus) return { error: "Campus not found in this tenant." };
  }

  const { hashPassword } = await import("@/lib/auth");
  const temporary = `Welcome-${randomBytes(6).toString("base64url")}`;
  const profileType = String(formData.get("profileType") ?? "STAFF");
  if (!["STAFF", "GUARDIAN"].includes(profileType)) return { error: "Choose a staff or guardian profile." };
  const nameParts = displayName.split(/\s+/);

  const user = await prisma.user.create({
    data: {
      tenant: { connect: { id: tenantId } },
      email,
      displayName,
      passwordHash: await hashPassword(temporary),
      status: "ACTIVE",
      person: { create: {
        tenant: { connect: { id: tenantId } }, firstName: nameParts[0], lastName: nameParts.slice(1).join(" "), email,
        ...(profileType === "GUARDIAN" ? { guardian: { create: { tenantId } } } : { staff: { create: { tenantId, employeeNumber: `STAFF-${randomBytes(6).toString("hex")}` } } }),
      } },
      roleAssignments: {
        create: { roleId, scopeType, campusId: scopeType === "CAMPUS" ? campusId : null },
      },
    },
  });
  await syncSeats(tenantId);

  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "platform.user.created",
    targetType: "User",
    targetId: user.id,
    scopeType: "PLATFORM",
    metadata: { email, displayName, role: role.name },
  });

  revalidatePath(`/portal/platform/tenants/${tenantId}`);
  return {
    ok: true,
    message: `${displayName} created. Temporary password for ${email}: ${temporary} — shown once, give it to them directly.`,
  };
}

const assignRoleSchema = z.object({
  userId: z.string().min(1),
  roleId: z.string().min(1),
  scopeType: z.enum(["ORG", "CAMPUS"]),
  campusId: z.string().optional(),
});

export async function platformAssignRole(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const parsed = assignRoleSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
    scopeType: formData.get("scopeType"),
    campusId: String(formData.get("campusId") ?? "") || undefined,
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { userId, roleId, scopeType, campusId } = parsed.data;
  if (scopeType === "CAMPUS" && !campusId) {
    return { error: "Choose a campus for a campus-scoped role." };
  }

  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findUnique({ where: { id: roleId } }),
  ]);
  if (!user || !user.tenantId) return { error: "User not found." };
  if (!role) return { error: "Role not found." };
  // Must belong to this exact tenant — tenantId: null is reserved for system
  // roles (the platform "*" wildcard) and must never be grantable here.
  if (role.tenantId !== user.tenantId) {
    return { error: "That role does not belong to this user's school." };
  }
  if (scopeType === "CAMPUS") {
    const campus = await prisma.campus.findFirst({ where: { id: campusId, tenantId: user.tenantId } });
    if (!campus) return { error: "Campus not found in this user's school." };
  }

  const effectiveCampusId = scopeType === "CAMPUS" ? (campusId as string) : null;
  const existingAssignment = await prisma.roleAssignment.findFirst({
    where: { userId, roleId, scopeType, campusId: effectiveCampusId },
  });
  const assignment =
    existingAssignment ??
    (await prisma.roleAssignment.create({
      data: { userId, roleId, scopeType, campusId: effectiveCampusId },
    }));

  await audit({
    tenantId: user.tenantId,
    actorUserId: ctx.user.id,
    action: "platform.user.role_assigned",
    targetType: "RoleAssignment",
    targetId: assignment.id,
    scopeType: "PLATFORM",
    metadata: { userId, role: role.name, scopeType, campusId },
  });

  revalidatePath(`/portal/platform/tenants/${user.tenantId}`);
  return { ok: true, message: `${role.name} granted.` };
}

export async function platformRemoveRoleAssignment(
  _prev: TenantActionState,
  formData: FormData,
): Promise<TenantActionState> {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.manage");

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const assignment = await prisma.roleAssignment.findUnique({
    where: { id: assignmentId },
    include: { user: true, role: true },
  });
  if (!assignment) return { error: "Assignment not found." };
  if (assignment.user.isPlatformStaff || !assignment.user.tenantId) return { error: "School users only." };

  const remaining = await prisma.roleAssignment.count({
    where: { userId: assignment.userId },
  });
  if (remaining <= 1) {
    return { error: "Cannot remove a user's last role — disable the user instead." };
  }

  await prisma.roleAssignment.delete({ where: { id: assignmentId } });

  await audit({
    tenantId: assignment.user.tenantId,
    actorUserId: ctx.user.id,
    action: "platform.user.role_removed",
    targetType: "RoleAssignment",
    targetId: assignmentId,
    scopeType: "PLATFORM",
    metadata: { userId: assignment.userId, role: assignment.role.name },
  });

  revalidatePath(`/portal/platform/tenants/${assignment.user.tenantId}`);
  return { ok: true, message: `${assignment.role.name} removed.` };
}

export async function startImpersonationAction(formData: FormData) {
  const ctx = await requireUser();
  assertPermission(ctx, "platform.impersonate");
  if (!ctx.isPlatformStaff) throw new Error("Only platform staff may impersonate.");

  const targetUserId = String(formData.get("targetUserId"));
  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new Error("User not found.");
  if (target.status !== "ACTIVE") throw new Error("Only active users can be impersonated.");
  if (target.isPlatformStaff)
    throw new Error("Cannot impersonate another platform staff account.");

  await startImpersonation(ctx.user.id, targetUserId);
  await audit({
    tenantId: target.tenantId,
    actorUserId: ctx.user.id,
    action: "iam.impersonation.start",
    targetType: "User",
    targetId: targetUserId,
    scopeType: "PLATFORM",
  });

  redirect("/portal");
}
