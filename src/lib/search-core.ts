import "server-only";
import { prisma } from "./db";
import { canAnywhere } from "./rbac";
import type { AuthzContext } from "./rbac";
import { allowedCampusIds } from "./scope";

export interface SearchResult {
  type: "student" | "staff" | "application";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

// Core of global search, separated from the server action so it can be
// exercised in integration tests with a hand-built AuthzContext instead of a
// real request/session. The server action is a thin wrapper that only supplies
// the context.
//
// Invariants (regression-guarded in tests/integration/search-scope):
//  - gate is canAnywhere, never can — a campus-scoped role must still get hits.
//  - every branch filters by allowedCampusIds — a permission held on one campus
//    must not return records from another campus or another tenant.
export async function runGlobalSearch(
  ctx: AuthzContext,
  query: string,
): Promise<SearchResult[]> {
  if (!ctx.tenantId) return [];
  const q = query.trim();
  if (q.length < 2) return [];

  const tenantId = ctx.tenantId;
  const results: SearchResult[] = [];

  if (canAnywhere(ctx, "student.read")) {
    const campuses = allowedCampusIds(ctx, "student.read");
    const students = await prisma.student.findMany({
      where: {
        tenantId,
        status: { not: "WITHDRAWN" },
        ...(campuses
          ? { enrollments: { some: { campusId: { in: campuses } } } }
          : {}),
        OR: [
          { admissionNumber: { contains: q, mode: "insensitive" } },
          { person: { firstName: { contains: q, mode: "insensitive" } } },
          { person: { lastName: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: { person: true },
      take: 5,
    });
    for (const s of students) {
      results.push({
        type: "student",
        id: s.id,
        label: `${s.person.firstName} ${s.person.lastName}`,
        sublabel: `#${s.admissionNumber} · ${s.status}`,
        href: `/portal/students/${s.id}`,
      });
    }
  }

  if (canAnywhere(ctx, "hr.staff.read")) {
    const campuses = allowedCampusIds(ctx, "hr.staff.read");
    const staff = await prisma.staff.findMany({
      where: {
        tenantId,
        ...(campuses
          ? { employmentRecords: { some: { campusId: { in: campuses } } } }
          : {}),
        person: {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      include: { person: true },
      take: 5,
    });
    for (const s of staff) {
      results.push({
        type: "staff",
        id: s.id,
        label: `${s.person.firstName} ${s.person.lastName}`,
        sublabel: s.person.email ?? `Employee #${s.employeeNumber}`,
        href: `/portal/hr`,
      });
    }
  }

  if (canAnywhere(ctx, "admissions.read")) {
    const campuses = allowedCampusIds(ctx, "admissions.read");
    const apps = await prisma.application.findMany({
      where: {
        tenantId,
        ...(campuses ? { campusId: { in: campuses } } : {}),
        stage: { notIn: ["ENROLLED", "WITHDRAWN"] },
        OR: [
          { applicant: { firstName: { contains: q, mode: "insensitive" } } },
          { applicant: { lastName: { contains: q, mode: "insensitive" } } },
        ],
      },
      include: { applicant: true, campus: true },
      take: 5,
    });
    for (const a of apps) {
      results.push({
        type: "application",
        id: a.id,
        label: `${a.applicant.firstName} ${a.applicant.lastName}`,
        sublabel: `Application · ${a.campus.name} · ${a.stage}`,
        href: `/portal/admissions/${a.id}`,
      });
    }
  }

  return results.slice(0, 10);
}
