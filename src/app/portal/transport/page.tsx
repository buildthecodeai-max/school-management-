import Link from "next/link";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";
import { PageHeader, Card, Badge, ButtonLink } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { seatsLeft } from "@/lib/transport";
import { createVehicle, deleteVehicle, createRoute, deactivateRoute, addStop, removeStop, assignStudentToRoute, removeRouteAssignment } from "./actions";

export const metadata = { title: "Transport" };

export default async function TransportPage({ searchParams }: { searchParams: Promise<{ campusId?: string }> }) {
  const ctx = await requirePermission("transport.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, orderBy: { name: "asc" } });
  const accessible = campuses.filter((c) => canForCampus(ctx, "transport.read", c.id));
  const preferred = await preferredCampusId(ctx, "transport.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);
  const canWrite = campusId ? canForCampus(ctx, "transport.write", campusId) : false;
  const canRecord = campusId ? canForCampus(ctx, "transport.trip.record", campusId) : false;

  const [routes, vehicles, drivers] = campusId
    ? await Promise.all([
        prisma.route.findMany({
          where: { tenantId: ctx.tenantId!, campusId, active: true },
          include: { vehicle: true, stops: { orderBy: { order: "asc" } }, assignments: { include: { student: { include: { person: true } } }, orderBy: { createdAt: "asc" } } },
          orderBy: { name: "asc" },
        }),
        prisma.vehicle.findMany({ where: { tenantId: ctx.tenantId!, campusId }, include: { driver: { include: { person: true } }, _count: { select: { routes: true } } }, orderBy: { regNumber: "asc" } }),
        canWrite
          ? prisma.staff.findMany({ where: { tenantId: ctx.tenantId!, employmentRecords: { some: { campusId } } }, include: { person: true }, orderBy: { person: { lastName: "asc" } } })
          : Promise.resolve([]),
      ])
    : [[], [], []];

  return (
    <div>
      <PageHeader title="Transport" subtitle="Fleet, routes, student assignments and trip attendance" />

      <div className="mb-6 flex flex-wrap gap-2">
        {accessible.map((c) => (
          <Link key={c.id} href={`?campusId=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${c.id === campusId ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"}`}>
            {c.name}
          </Link>
        ))}
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Fleet ({vehicles.length})</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <Card key={v.id}>
              <p className="font-semibold">{v.regNumber}</p>
              <p className="text-sm text-[color:var(--color-muted)]">{v.model ?? "Model not set"} · {v.capacity} seats</p>
              <p className="text-xs text-[color:var(--color-muted)]">{v.driver ? `Driver: ${v.driver.person.firstName} ${v.driver.person.lastName}` : "No driver assigned"}</p>
              {canWrite && v._count.routes === 0 && (
                <ActionForm action={deleteVehicle} submit="Remove" variant="danger" confirmText={`Remove vehicle ${v.regNumber}?`} className="mt-2">
                  <input type="hidden" name="vehicleId" value={v.id} />
                </ActionForm>
              )}
            </Card>
          ))}
          {vehicles.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">No vehicles yet.</p>}
        </div>
        {canWrite && campusId && (
          <Card className="mt-4">
            <h3 className="mb-3 text-sm font-semibold">Add a vehicle</h3>
            <ActionForm action={createVehicle} submit="Add vehicle" pendingLabel="Adding…" className="grid gap-3 sm:grid-cols-4">
              <input type="hidden" name="campusId" value={campusId} />
              <label><span className={labelCls}>Registration</span><input name="regNumber" required maxLength={30} className={inputCls} /></label>
              <label><span className={labelCls}>Model</span><input name="model" maxLength={60} className={inputCls} /></label>
              <label><span className={labelCls}>Seats</span><input name="capacity" type="number" min={1} max={200} required className={inputCls} /></label>
              <label><span className={labelCls}>Driver</span>
                <select name="driverStaffId" className={inputCls}><option value="">— none —</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.person.firstName} {d.person.lastName}</option>)}</select></label>
            </ActionForm>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Routes ({routes.length})</h2>
        {canWrite && campusId && (
          <Card className="mb-4">
            <h3 className="mb-3 text-sm font-semibold">Add a route</h3>
            <ActionForm action={createRoute} submit="Create route" pendingLabel="Creating…" className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="campusId" value={campusId} />
              <label><span className={labelCls}>Route name</span><input name="name" required maxLength={80} className={inputCls} /></label>
              <label><span className={labelCls}>Vehicle</span>
                <select name="vehicleId" className={inputCls}><option value="">— none yet —</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.regNumber}</option>)}</select></label>
            </ActionForm>
          </Card>
        )}
        {routes.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">No active routes.</p>
        ) : (
          <div className="space-y-4">
            {routes.map((r) => {
              const left = seatsLeft(r.vehicle?.capacity, r.assignments.length);
              return (
                <Card key={r.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-sm text-[color:var(--color-muted)]">
                        {r.stops.length} stop(s) · {r.assignments.length} student(s){r.vehicle ? ` · ${r.vehicle.regNumber}` : " · no vehicle"}
                        {left !== null && <> · <Badge tone={left === 0 ? "red" : "green"}>{left} seat{left === 1 ? "" : "s"} free</Badge></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canRecord && <ButtonLink href={`/portal/transport/trip?routeId=${r.id}`} variant="ghost">Record trip</ButtonLink>}
                      {canWrite && (
                        <ActionForm action={deactivateRoute} submit="Deactivate" variant="danger" confirmText={`Deactivate route "${r.name}"? Trip history is kept.`}>
                          <input type="hidden" name="routeId" value={r.id} />
                        </ActionForm>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {r.stops.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                        {s.order}. {s.name}
                        {canWrite && (
                          <ActionForm action={removeStop} submit="×" variant="ghost" confirmText={`Remove stop "${s.name}"?`}>
                            <input type="hidden" name="stopId" value={s.id} />
                          </ActionForm>
                        )}
                      </span>
                    ))}
                  </div>
                  {canWrite && (
                    <ActionForm action={addStop} submit="Add stop" className="mt-3 flex items-end gap-2">
                      <input type="hidden" name="routeId" value={r.id} />
                      <input name="name" required maxLength={80} placeholder="Stop name" className={inputCls} />
                    </ActionForm>
                  )}

                  <div className="mt-4">
                    {r.assignments.length > 0 && (
                      <ul className="divide-y divide-[color:var(--color-line)] text-sm">
                        {r.assignments.map((a) => (
                          <li key={a.id} className="flex items-center justify-between py-1.5">
                            <span>{a.student.person.firstName} {a.student.person.lastName} <span className="text-xs text-[color:var(--color-muted)]">{a.student.admissionNumber}{a.boardingStopId ? ` · ${r.stops.find((s) => s.id === a.boardingStopId)?.name ?? ""}` : ""}</span></span>
                            {canWrite && (
                              <ActionForm action={removeRouteAssignment} submit="Remove" variant="ghost">
                                <input type="hidden" name="assignmentId" value={a.id} />
                              </ActionForm>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canWrite && (
                      <ActionForm action={assignStudentToRoute} submit="Assign student" pendingLabel="Assigning…" className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="routeId" value={r.id} />
                        <input name="admissionNumber" required placeholder="Admission number" className={inputCls} />
                        <select name="stopId" className={inputCls}><option value="">Stop (optional)</option>{r.stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                      </ActionForm>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
