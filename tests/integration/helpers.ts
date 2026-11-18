import { PrismaClient } from "@prisma/client";
import { resolveAuthz, type AuthzContext } from "@/lib/rbac";

// Integration tests talk to the real database at DATABASE_URL (the local
// docker-compose Postgres in dev). Each test builds its own throwaway tenants
// with a unique prefix and removes them in afterAll, so a run never touches
// seed data.

export const prisma = new PrismaClient();

export const TEST_PREFIX = "itest_";

let counter = 0;
export function uid(label = "x"): string {
  counter += 1;
  return `${TEST_PREFIX}${label}_${Date.now().toString(36)}_${counter}`;
}

export async function makeTenant(name = "Test Org") {
  return prisma.tenant.create({
    data: { name, slug: uid("slug"), status: "ACTIVE" },
  });
}

export async function makeCampus(tenantId: string, name = "Campus") {
  return prisma.campus.create({
    data: {
      tenantId,
      name: `${name} ${uid("c")}`,
      // Short and unique: the counter must survive any truncation.
      code: `C${(++counter).toString(36)}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase().slice(0, 20),
      status: "ACTIVE",
    },
  });
}

// A role carrying exactly `permissions`, assigned to a fresh user either
// org-wide (scope: "ORG") or on one campus (scope: "CAMPUS" + campusId).
export async function makeUser(opts: {
  tenantId: string;
  permissions: string[];
  scope: "ORG" | "CAMPUS";
  campusId?: string;
  isPlatformStaff?: boolean;
}) {
  const role = await prisma.role.create({
    data: {
      tenantId: opts.tenantId,
      name: uid("role"),
      permissions: opts.permissions,
    },
  });
  const user = await prisma.user.create({
    data: {
      tenantId: opts.tenantId,
      email: `${uid("u")}@example.test`,
      displayName: "Test User",
      passwordHash: "x",
      isPlatformStaff: opts.isPlatformStaff ?? false,
      roleAssignments: {
        create: {
          roleId: role.id,
          scopeType: opts.scope,
          campusId: opts.scope === "CAMPUS" ? opts.campusId : null,
        },
      },
    },
  });
  return user;
}

// Rebuilds the same object shape getSessionUser() returns, then runs the real
// resolveAuthz — so tests exercise the production authorization resolution.
export async function authContextFor(userId: string): Promise<AuthzContext> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      tenant: true,
      person: true,
      roleAssignments: { include: { role: true, campus: true } },
    },
  });
  return resolveAuthz({ ...user, impersonatedByUserId: null } as Parameters<
    typeof resolveAuthz
  >[0]);
}

export async function makeStudent(opts: {
  tenantId: string;
  campusId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}) {
  const person = await prisma.person.create({
    data: {
      tenantId: opts.tenantId,
      firstName: opts.firstName,
      lastName: opts.lastName,
    },
  });
  const student = await prisma.student.create({
    data: {
      tenantId: opts.tenantId,
      personId: person.id,
      admissionNumber: opts.admissionNumber,
      status: "ENROLLED",
    },
  });
  const year = await prisma.academicYear.create({
    data: {
      tenantId: opts.tenantId,
      campusId: opts.campusId,
      name: uid("AY"),
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });
  const grade = await prisma.gradeLevel.create({
    data: { tenantId: opts.tenantId, campusId: opts.campusId, name: uid("G"), rank: 1 },
  });
  const section = await prisma.section.create({
    data: {
      tenantId: opts.tenantId,
      campusId: opts.campusId,
      academicYearId: year.id,
      gradeLevelId: grade.id,
      name: uid("S"),
    },
  });
  await prisma.enrollment.create({
    data: {
      tenantId: opts.tenantId,
      studentId: student.id,
      campusId: opts.campusId,
      academicYearId: year.id,
      gradeLevelId: grade.id,
      sectionId: section.id,
      status: "ACTIVE",
      startDate: new Date("2026-01-05"),
    },
  });
  return student;
}

// Deletes every test-prefixed tenant. Tenant relations cascade on delete, so
// this also removes their campuses, users, roles, people, students, etc.
// Test-prefixed audit rows (chainKey = a deleted tenant id) and platform-chain
// rows written during tests are cleared separately.
export async function cleanupAll() {
  const tenants = await prisma.tenant.findMany({
    where: { slug: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = tenants.map((t) => t.id);
  if (ids.length) {
    await prisma.auditEvent.deleteMany({ where: { chainKey: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.auditEvent.deleteMany({
    where: { action: { startsWith: TEST_PREFIX } },
  });
}
