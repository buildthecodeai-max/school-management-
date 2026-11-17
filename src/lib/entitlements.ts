import "server-only";
import { prisma } from "@/lib/db";

// BIL-002: Central entitlement enforcement. Called at the highest-value
// creation points (enrollment, staff, campus creation) to enforce plan limits.

// A student transferred between campuses keeps a real place in the school: the
// source enrollment closes as TRANSFERRED_OUT and the destination opens as
// TRANSFERRED_IN. Counting only ACTIVE makes transferred students vanish from
// rosters, dashboards and plan limits alike.
export const ENROLLED_STATUSES = ["ACTIVE", "TRANSFERRED_IN"] as const;

type LimitKey = "maxStudents" | "maxCampuses" | "maxStaff";

async function getPlanLimits(
  tenantId: string,
): Promise<{ limits: Record<LimitKey, number>; planName: string | null }> {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    include: {
      plan: {
        include: {
          versions: { orderBy: { effectiveFrom: "desc" }, take: 1 },
        },
      },
    },
  });

  const plan = sub?.plan;
  if (!plan) {
    return {
      limits: { maxStudents: Infinity, maxCampuses: Infinity, maxStaff: Infinity },
      planName: null,
    };
  }

  // Latest plan version wins; fall back to plan-level limits if none exists.
  const latestVersion = plan.versions[0];
  const versionLimits = (latestVersion?.limits ?? {}) as Record<string, number>;

  return {
    planName: plan.name,
    limits: {
      maxStudents: versionLimits.maxStudents ?? plan.maxStudents,
      maxCampuses: versionLimits.maxCampuses ?? plan.maxCampuses,
      maxStaff: versionLimits.maxStaff ?? Infinity,
    },
  };
}

// Plan limits price *current* usage. Counting every Student row would bill a
// school for alumni it graduated years ago, and every Campus row would bill it
// for campuses it has closed.
function currentCounts(tenantId: string) {
  return Promise.all([
    prisma.student.count({
      where: {
        tenantId,
        enrollments: { some: { status: { in: [...ENROLLED_STATUSES] } } },
      },
    }),
    prisma.campus.count({ where: { tenantId, status: { not: "CLOSED" } } }),
    prisma.staff.count({ where: { tenantId } }),
  ]);
}

export type Resource = "students" | "campuses" | "staff";

// Returns an error message when adding `adding` more of `resource` would
// exceed the tenant's plan, or null when it is allowed. Prefer this in server
// actions that report errors through form state.
export async function checkLimit(
  tenantId: string,
  resource: Resource,
  adding = 1,
): Promise<string | null> {
  const [{ limits, planName }, [students, campuses, staff]] = await Promise.all([
    getPlanLimits(tenantId),
    currentCounts(tenantId),
  ]);

  const used = { students, campuses, staff }[resource];
  const limit = {
    students: limits.maxStudents,
    campuses: limits.maxCampuses,
    staff: limits.maxStaff,
  }[resource];

  if (used + adding <= limit) return null;

  const noun = { students: "students", campuses: "campuses", staff: "staff members" }[
    resource
  ];
  const plural = resource === "campuses" && limit === 1 ? "campus" : noun;
  return `The ${planName ?? "current"} plan allows ${limit} ${plural} and you have ${used}. Upgrade the plan to add ${adding === 1 ? "another" : `${adding} more`}.`;
}

// Throwing variant, for call sites that surface errors as thrown exceptions.
export async function assertWithinLimit(
  tenantId: string,
  resource: Resource,
  adding = 1,
): Promise<void> {
  const error = await checkLimit(tenantId, resource, adding);
  if (error) throw new Error(error);
}

export interface TenantUsage {
  planName: string;
  students: number;
  maxStudents: number;
  campuses: number;
  maxCampuses: number;
  seats: number;
  studentsOverBy: number;
  campusesOverBy: number;
  overLimit: boolean;
}

// Single source of truth for "how much of its plan is this tenant using" — the
// platform registry, the tenant detail page and the creation guards all read
// through here so they cannot disagree.
export async function getTenantUsage(tenantId: string): Promise<TenantUsage | null> {
  const [{ limits, planName }, [students, campuses], seats] = await Promise.all([
    getPlanLimits(tenantId),
    currentCounts(tenantId),
    prisma.user.count({ where: { tenantId, status: "ACTIVE" } }),
  ]);
  if (!planName) return null;

  return {
    planName,
    students,
    maxStudents: limits.maxStudents,
    campuses,
    maxCampuses: limits.maxCampuses,
    seats,
    studentsOverBy: Math.max(0, students - limits.maxStudents),
    campusesOverBy: Math.max(0, campuses - limits.maxCampuses),
    overLimit: students > limits.maxStudents || campuses > limits.maxCampuses,
  };
}

// Usage summary for the tenant-facing subscription page.
export async function getUsageSummary(tenantId: string) {
  const [{ limits }, [students, campuses, staff]] = await Promise.all([
    getPlanLimits(tenantId),
    currentCounts(tenantId),
  ]);

  return {
    students: { used: students, limit: limits.maxStudents },
    campuses: { used: campuses, limit: limits.maxCampuses },
    staff: { used: staff, limit: limits.maxStaff },
  };
}

// Keeps Subscription.seatsInUse honest, so the platform registry reflects
// reality instead of the seeded number.
export async function syncSeats(tenantId: string): Promise<void> {
  const seats = await prisma.user.count({ where: { tenantId, status: "ACTIVE" } });
  await prisma.subscription.updateMany({
    where: { tenantId },
    data: { seatsInUse: seats },
  });
}
