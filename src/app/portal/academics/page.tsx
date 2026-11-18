import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import Link from "next/link";

export default async function AcademicsPage() {
  const ctx = await requirePermission("academics.read");
  const campusIds = allowedCampusIds(ctx, "academics.read");

  const campuses = await prisma.campus.findMany({
    where: {
      tenantId: ctx.tenantId!,
      ...(campusIds ? { id: { in: campusIds } } : {}),
    },
    include: {
      academicYears: { include: { terms: true } },
      gradeLevels: {
        orderBy: { rank: "asc" },
        include: {
          sections: {
            include: {
              homeroomStaff: { include: { person: true } },
              _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Academics"
        subtitle="Academic years, grades, sections and timetables by campus."
      />

      <div className="mb-6">
        <Link
          href="/portal/academics/timetable"
          className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
        >
          View timetable →
        </Link>
        <Link href="/portal/academics/config" className="mr-2 inline-flex rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Configure →</Link>
        <Link href="/portal/academics/planning" className="ml-2 inline-flex rounded border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700">Planning →</Link>
      </div>

      {campuses.length === 0 ? (
        <EmptyState title="No academic structure in your scope" />
      ) : (
        <div className="space-y-6">
          {campuses.map((c) => {
            const year = c.academicYears.find((y) => y.isCurrent) ?? c.academicYears[0];
            return (
              <div key={c.id}>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  {year && <Badge tone="brand">{year.name}</Badge>}
                </div>
                {year && (
                  <p className="mb-3 text-sm text-[color:var(--color-muted)]">
                    Terms: {year.terms.map((t) => t.name).join(", ") || "—"}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {c.gradeLevels.map((g) =>
                    g.sections.map((s) => (
                      <Card key={s.id}>
                        <p className="font-semibold">
                          {g.name} · {s.name}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--color-muted)]">
                          {s._count.enrollments}/{s.capacity} students
                        </p>
                        <p className="mt-2 text-sm">
                          {s.homeroomStaff ? (
                            <span>
                              Homeroom:{" "}
                              <span className="font-medium">
                                {s.homeroomStaff.person.firstName}{" "}
                                {s.homeroomStaff.person.lastName}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[color:var(--color-muted)]">
                              No homeroom teacher
                            </span>
                          )}
                        </p>
                      </Card>
                    )),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
