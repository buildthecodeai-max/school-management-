import { requirePermission, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { allowedCampusIds } from "@/lib/scope";
import { PageHeader, Card, Badge, StatCard } from "@/components/ui";
import { CreateCampusForm, EditCampusForm, LifecycleButton } from "./CampusForms";
import { ENROLLED_STATUSES } from "@/lib/entitlements";

export default async function CampusesPage() {
  const ctx = await requirePermission("campus.read");
  const campusIds = allowedCampusIds(ctx, "campus.read");
  const canWrite = can(ctx, "campus.write");

  const campuses = await prisma.campus.findMany({
    where: {
      tenantId: ctx.tenantId!,
      ...(campusIds ? { id: { in: campusIds } } : {}),
    },
    include: {
      _count: {
        select: {
          enrollments: { where: { status: { in: [...ENROLLED_STATUSES] } } },
          sections: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const totalStudents = campuses.reduce(
    (n, c) => n + c._count.enrollments,
    0,
  );

  const tenant = canWrite
    ? await prisma.tenant.findUnique({
        where: { id: ctx.tenantId! },
        select: { timezone: true },
      })
    : null;

  return (
    <div>
      <PageHeader
        title="Campuses"
        subtitle={
          campusIds
            ? "You are scoped to specific campuses."
            : "Organization-wide view of all campuses."
        }
      />

      {canWrite && (
        <CreateCampusForm defaultTimezone={tenant?.timezone ?? "UTC"} />
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Campuses in scope" value={campuses.length} />
        <StatCard label="Total students" value={totalStudents} tone="sky" />
        <StatCard
          label="Sections"
          value={campuses.reduce((n, c) => n + c._count.sections, 0)}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {campuses.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {c.logoUrl ? (
                  <img
                    src={c.logoUrl}
                    alt={`${c.name} logo`}
                    className="h-10 w-10 flex-shrink-0 rounded-md border border-[color:var(--color-line)] object-contain bg-white p-1"
                  />
                ) : (
                  <div className="h-10 w-10 flex-shrink-0 rounded-md border border-[color:var(--color-line)] bg-[color:var(--color-surface2)] flex items-center justify-center text-xs font-bold text-[color:var(--color-muted)]">
                    {c.code.slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-lg font-semibold truncate">{c.name}</p>
                  <p className="text-sm text-[color:var(--color-muted)]">
                    {c.city ? `${c.city} · ` : ""}
                    {c.timezone}
                  </p>
                </div>
              </div>
              <Badge tone={c.status === "ACTIVE" ? "green" : "amber"}>
                {c.status}
              </Badge>
            </div>
            <div className="mt-4 flex gap-6 text-sm">
              <div>
                <p className="text-2xl font-semibold">{c._count.enrollments}</p>
                <p className="text-[color:var(--color-muted)]">students</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{c._count.sections}</p>
                <p className="text-[color:var(--color-muted)]">sections</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{c.code}</p>
                <p className="text-[color:var(--color-muted)]">code</p>
              </div>
            </div>

            {canWrite && (
              <div className="mt-4 border-t border-[color:var(--color-line)] pt-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <EditCampusForm campus={{ id: c.id, name: c.name, city: c.city, addressLine: c.addressLine, logoUrl: c.logoUrl ?? null }} />
                  {c.status !== "CLOSED" && (
                    <>
                      {c.status !== "ACTIVE" && (
                        <LifecycleButton campusId={c.id} kind="activate" label="Activate" />
                      )}
                      {c.status === "ACTIVE" && (
                        <LifecycleButton campusId={c.id} kind="suspend" label="Suspend" />
                      )}
                      <LifecycleButton campusId={c.id} kind="close" label="Close" />
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
