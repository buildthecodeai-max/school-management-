import { prisma } from "@/lib/db";
import type { AuthzContext } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { ENROLLED_STATUSES } from "@/lib/entitlements";
import { StatCard, Card, PageHeader, Badge, ButtonLink } from "@/components/ui";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function StaffDashboard({ ctx }: { ctx: AuthzContext }) {
  const tenantId = ctx.tenantId!;
  const campusIds = allowedCampusIds(ctx, "student.read"); // null = all

  const campusFilter = campusIds ? { in: campusIds } : undefined;

  const [studentCount, campusCount, enrollmentsToday, sessionsToday, absentRecords] =
    await Promise.all([
      prisma.enrollment.count({
        where: {
          tenantId,
          status: { in: [...ENROLLED_STATUSES] },
          ...(campusFilter ? { campusId: campusFilter } : {}),
        },
      }),
      prisma.campus.count({
        where: {
          tenantId,
          status: "ACTIVE",
          ...(campusIds ? { id: { in: campusIds } } : {}),
        },
      }),
      prisma.enrollment.count({
        where: {
          tenantId,
          status: { in: [...ENROLLED_STATUSES] },
          ...(campusFilter ? { campusId: campusFilter } : {}),
        },
      }),
      prisma.attendanceSession.findMany({
        where: {
          tenantId,
          date: { gte: startOfToday(), lte: endOfToday() },
          ...(campusFilter ? { campusId: campusFilter } : {}),
        },
        include: { section: true },
      }),
      prisma.attendanceRecord.count({
        where: {
          tenantId,
          createdAt: { gte: startOfToday(), lte: endOfToday() },
          code: { category: { in: ["ABSENT", "LATE"] } },
          ...(campusFilter ? { session: { campusId: campusFilter } } : {}),
        },
      }),
    ]);

  const submitted = sessionsToday.filter(
    (s) => s.status !== "DRAFT",
  ).length;
  const pending = sessionsToday.length - submitted;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${ctx.user.tenant?.name ?? ""} · organization overview`}
        action={
          <ButtonLink href="/portal/attendance">Take attendance</ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active enrollments"
          value={studentCount}
          hint={`across ${campusCount} campus${campusCount === 1 ? "" : "es"}`}
        />
        <StatCard
          label="Registers today"
          value={sessionsToday.length}
          tone="sky"
          hint={`${submitted} submitted · ${pending} pending`}
        />
        <StatCard
          label="Absences & lates today"
          value={absentRecords}
          tone="amber"
          hint="qualifying guardian alerts"
        />
        <StatCard
          label="Campuses"
          value={campusCount}
          tone="green"
          hint="active operating units"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Today&apos;s registers</h3>
          {sessionsToday.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">
              No attendance registers have been opened today.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--color-line)]">
              {sessionsToday.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="font-medium">{s.section.name}</span>
                  <Badge
                    tone={
                      s.status === "LOCKED"
                        ? "slate"
                        : s.status === "SUBMITTED"
                          ? "green"
                          : "amber"
                    }
                  >
                    {s.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">Quick actions</h3>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/portal/students" variant="ghost">
              View students
            </ButtonLink>
            <ButtonLink href="/portal/attendance" variant="ghost">
              Attendance
            </ButtonLink>
            <ButtonLink href="/portal/academics" variant="ghost">
              Academics
            </ButtonLink>
            <ButtonLink href="/portal/campuses" variant="ghost">
              Campuses
            </ButtonLink>
          </div>
          <p className="mt-4 text-xs text-[color:var(--color-muted)]">
            Actions are filtered by your role and campus scope. You only see
            data for campuses you are assigned to.
          </p>
        </Card>
      </div>
    </div>
  );
}
