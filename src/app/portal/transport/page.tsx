import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";

export const metadata = { title: "Transport" };

export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string }>;
}) {
  const ctx = await requirePermission("transport.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const accessible = campuses.filter((c) => canForCampus(ctx, "transport.read", c.id));
  const preferred = await preferredCampusId(ctx, "transport.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);

  const [routes, vehicles] = campusId
    ? await Promise.all([
        prisma.route.findMany({
          where: { tenantId: ctx.tenantId!, campusId, active: true },
          include: {
            vehicle: true,
            stops: { orderBy: { order: "asc" } },
            assignments: { include: { student: { include: { person: true } } } },
          },
          orderBy: { name: "asc" },
        }),
        prisma.vehicle.findMany({
          where: { tenantId: ctx.tenantId!, campusId },
          include: { driver: { include: { person: true } } },
        }),
      ])
    : [[], []];

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transport</h1>
      </div>

      {/* Campus tabs */}
      <div className="flex gap-2 flex-wrap">
        {campuses.map((c) => (
          <a
            key={c.id}
            href={`?campusId=${c.id}`}
            className={`rounded-full px-3 py-1 text-sm font-medium border ${
              c.id === campusId
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {c.name}
          </a>
        ))}
      </div>

      {/* Vehicles */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Fleet ({vehicles.length})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <div key={v.id} className="rounded border border-gray-200 p-3">
              <div className="font-medium">{v.regNumber}</div>
              <div className="text-sm text-gray-500">{v.model ?? "Unknown model"} · Capacity: {v.capacity}</div>
              {v.driver && (
                <div className="text-xs text-gray-400">Driver: {v.driver.person.firstName} {v.driver.person.lastName}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Routes */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Routes ({routes.length})</h2>
        {routes.length === 0 ? (
          <p className="text-gray-500">No active routes.</p>
        ) : (
          routes.map((r) => (
            <div key={r.id} className="rounded border border-gray-200 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-sm text-gray-500">
                    {r.stops.length} stop(s) · {r.assignments.length} student(s) assigned
                    {r.vehicle && ` · ${r.vehicle.regNumber}`}
                  </div>
                </div>
                {campusId && canForCampus(ctx, "transport.trip.record", campusId) && (
                  <Link
                    href={`/portal/transport/trip?routeId=${r.id}&campusId=${campusId}`}
                    className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
                  >
                    Record trip
                  </Link>
                )}
              </div>
              {/* Stops */}
              <div className="flex gap-2 flex-wrap">
                {r.stops.map((s) => (
                  <span key={s.id} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                    {s.order}. {s.name}
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
