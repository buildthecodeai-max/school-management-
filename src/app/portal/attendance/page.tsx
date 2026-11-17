import Link from "next/link";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { dayStart, dayEnd } from "@/lib/dates";
import { PageHeader, Card, Badge, EmptyState, ButtonLink } from "@/components/ui";

export default async function AttendanceListPage() {
  const ctx = await requirePermission("attendance.read");
  const campusIds = allowedCampusIds(ctx, "attendance.read");

  const sections = await prisma.section.findMany({
    where: {
      tenantId: ctx.tenantId!,
      ...(campusIds ? { campusId: { in: campusIds } } : {}),
    },
    include: {
      campus: true,
      gradeLevel: true,
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
      attendanceSessions: {
        where: { date: { gte: dayStart(), lte: dayEnd() }, period: "DAY" },
        take: 1,
      },
    },
    orderBy: [{ campus: { name: "asc" } }, { gradeLevel: { rank: "asc" } }],
  });

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle={`Take and review today's registers · ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
        action={
          <ButtonLink href="/portal/attendance/analytics" variant="ghost">
            Analytics
          </ButtonLink>
        }
      />

      {sections.length === 0 ? (
        <EmptyState
          title="No sections in your scope"
          hint="You need attendance access on a campus with sections."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => {
            const session = s.attendanceSessions.at(0);
            const status: string = session?.status ?? "NOT_STARTED";
            return (
              <Link key={s.id} href={`/portal/attendance/${s.id}`}>
                <Card className="transition hover:border-brand-300 hover:shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">
                        {s.gradeLevel.name} · {s.name}
                      </p>
                      <p className="text-sm text-[color:var(--color-muted)]">
                        {s.campus.name}
                      </p>
                    </div>
                    <Badge
                      tone={
                        status === "LOCKED"
                          ? "slate"
                          : status === "SUBMITTED"
                            ? "green"
                            : status === "DRAFT"
                              ? "amber"
                              : "sky"
                      }
                    >
                      {status === "NOT_STARTED" ? "Not started" : status}
                    </Badge>
                  </div>
                  <p className="mt-4 text-sm text-[color:var(--color-muted)]">
                    {s._count.enrollments} student
                    {s._count.enrollments === 1 ? "" : "s"}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
