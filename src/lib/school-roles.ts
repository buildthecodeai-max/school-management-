import type { Prisma, PrismaClient } from "@prisma/client";
import { ALL_PERMISSIONS } from "./permissions";

type Db = PrismaClient | Prisma.TransactionClient;

const tenantPermissions = ALL_PERMISSIONS.filter((p) => !p.startsWith("platform."));

// The standard roles every school starts with (IAM-001).
export const STANDARD_ROLES: Record<string, string[]> = {
  "Organization Owner": tenantPermissions,
  "Campus Administrator": tenantPermissions.filter((p) => !p.startsWith("billing.") && !p.startsWith("health.") && !p.startsWith("safeguarding.")),
  "Admissions Officer": tenantPermissions.filter((p) => p.startsWith("admissions.") || ["student.read", "guardian.read", "campus.read", "message.read"].includes(p)),
  "Finance Officer": tenantPermissions.filter((p) => (p.startsWith("fee.") && p !== "fee.adjust") || ["student.read", "campus.read", "message.read"].includes(p)),
  Teacher: ["student.read", "academics.read", "attendance.read", "attendance.write", "exams.read", "exams.enter", "timetable.read", "campus.read", "message.read"],
  "Parent / Guardian": ["message.read"],
};

// Creates any missing standard role for the tenant and returns them by name.
export async function ensureStandardRoles(db: Db, tenantId: string) {
  const byName = new Map<string, { id: string; name: string }>();
  for (const [name, permissions] of Object.entries(STANDARD_ROLES)) {
    const existing = await db.role.findFirst({ where: { tenantId, name } });
    byName.set(name, existing ?? (await db.role.create({ data: { tenantId, name, permissions } })));
  }
  return byName;
}
