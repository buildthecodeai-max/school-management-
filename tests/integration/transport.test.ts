import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { createVehicle, deleteVehicle, createRoute, addStop, removeStop, assignStudentToRoute, removeRouteAssignment, recordTrip, deactivateRoute } from "@/app/portal/transport/actions";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";
import { formatDay } from "@/lib/attendance";
import { dayStart } from "@/lib/dates";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("transport management and trips", () => {
  let tenantId: string, campusId: string, otherCampus: string;
  let admin: unknown, driverUser: unknown, otherAdmin: unknown;
  let ad1: string, ad2: string, adOther: string, s1: string, s2: string;
  let vehicleId: string, routeId: string, stopA: string;

  beforeAll(async () => {
    tenantId = (await makeTenant("Bus Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    ad1 = uid("AD"); ad2 = uid("AD"); adOther = uid("AD");
    s1 = (await makeStudent({ tenantId, campusId, firstName: "Kid", lastName: "One", admissionNumber: ad1 })).id;
    s2 = (await makeStudent({ tenantId, campusId, firstName: "Kid", lastName: "Two", admissionNumber: ad2 })).id;
    await makeStudent({ tenantId, campusId: otherCampus, firstName: "Far", lastName: "Away", admissionNumber: adOther });
    admin = await authContextFor((await makeUser({ tenantId, permissions: ["transport.read", "transport.write", "transport.trip.record"], scope: "CAMPUS", campusId })).id);
    driverUser = await authContextFor((await makeUser({ tenantId, permissions: ["transport.read", "transport.trip.record"], scope: "CAMPUS", campusId })).id);
    otherAdmin = await authContextFor((await makeUser({ tenantId, permissions: ["transport.read", "transport.write", "transport.trip.record"], scope: "CAMPUS", campusId: otherCampus })).id);
  });
  afterAll(cleanupAll);

  it("only transport.write holders on the campus can manage the fleet", async () => {
    current = driverUser;
    expect((await createVehicle({}, fd({ campusId, regNumber: "BUS 1", capacity: "1" }))).error).toMatch(/permission/i);
    current = otherAdmin;
    expect((await createVehicle({}, fd({ campusId, regNumber: "BUS 1", capacity: "1" }))).error).toMatch(/permission/i);
    current = admin;
    expect((await createVehicle({}, fd({ campusId, regNumber: "BUS 1", capacity: "0" }))).error).toMatch(/capacity/i);
    expect((await createVehicle({}, fd({ campusId, regNumber: "bus 1", capacity: "1" }))).ok).toBe(true);
    expect((await createVehicle({}, fd({ campusId, regNumber: "BUS 1", capacity: "5" }))).error).toMatch(/already exists/i);
    vehicleId = (await prisma.vehicle.findFirstOrThrow({ where: { tenantId } })).id;
  });

  it("creates routes and stops, renumbering after a stop is removed", async () => {
    current = admin;
    expect((await createRoute({}, fd({ campusId, name: "North", vehicleId: "nope" }))).error).toMatch(/vehicle not found/i);
    expect((await createRoute({}, fd({ campusId, name: "North", vehicleId }))).ok).toBe(true);
    expect((await createRoute({}, fd({ campusId, name: "North" }))).error).toMatch(/already exists/i);
    routeId = (await prisma.route.findFirstOrThrow({ where: { tenantId } })).id;
    await addStop({}, fd({ routeId, name: "Stop A" }));
    await addStop({}, fd({ routeId, name: "Stop B" }));
    await addStop({}, fd({ routeId, name: "Stop C" }));
    const stops = await prisma.stop.findMany({ where: { routeId }, orderBy: { order: "asc" } });
    stopA = stops[0].id;
    await removeStop({}, fd({ stopId: stops[1].id }));
    const after = await prisma.stop.findMany({ where: { routeId }, orderBy: { order: "asc" } });
    expect(after.map((s) => [s.name, s.order])).toEqual([["Stop A", 1], ["Stop C", 2]]);
  });

  it("assigns only enrolled students of this campus, once, within vehicle capacity", async () => {
    current = admin;
    expect((await assignStudentToRoute({}, fd({ routeId, admissionNumber: adOther }))).error).toMatch(/no actively enrolled/i);
    expect((await assignStudentToRoute({}, fd({ routeId, admissionNumber: ad1, stopId: "bogus" }))).error).toMatch(/not on this route/i);
    expect((await assignStudentToRoute({}, fd({ routeId, admissionNumber: ad1, stopId: stopA }))).ok).toBe(true);
    expect((await assignStudentToRoute({}, fd({ routeId, admissionNumber: ad1 }))).error).toMatch(/already on route/i);
    expect((await assignStudentToRoute({}, fd({ routeId, admissionNumber: ad2 }))).error).toMatch(/is full/i);
    expect((await removeStop({}, fd({ stopId: stopA }))).error).toMatch(/use this stop/i);
    expect((await deleteVehicle({}, fd({ vehicleId }))).error).toMatch(/used by a route/i);
  });

  it("validates a trip: route, date, roster membership and duplicates; the campus is derived from the route", async () => {
    const day = formatDay(dayStart());
    const rec = (o: Record<string, string>) => recordTrip({}, fd({ routeId, direction: "MORNING", tripDate: day, records: JSON.stringify([{ studentId: s1, status: "BOARDED" }]), ...o }));
    current = otherAdmin;
    expect((await rec({})).error).toMatch(/permission/i);
    current = driverUser;
    const tomorrow = new Date(dayStart()); tomorrow.setDate(tomorrow.getDate() + 1);
    expect((await rec({ tripDate: formatDay(tomorrow) })).error).toMatch(/future/i);
    expect((await rec({ records: JSON.stringify([{ studentId: s2, status: "BOARDED" }]) })).error).toMatch(/not on this route/i);
    expect((await rec({ records: JSON.stringify([{ studentId: s1, status: "FLYING" }]) })).error).toMatch(/valid status/i);
    expect((await rec({ routeId: "nope" })).error).toMatch(/route not found/i);
    expect((await rec({})).ok).toBe(true);
    expect((await rec({})).error).toMatch(/already been recorded/i);
    expect(await prisma.tripAttendance.count({ where: { tenantId } })).toBe(1);
  });

  it("removes assignments and deactivates routes while keeping trip history", async () => {
    current = admin;
    const a = await prisma.routeAssignment.findFirstOrThrow({ where: { routeId } });
    expect((await removeRouteAssignment({}, fd({ assignmentId: a.id }))).ok).toBe(true);
    expect((await deactivateRoute({}, fd({ routeId }))).ok).toBe(true);
    expect((await prisma.route.findUniqueOrThrow({ where: { id: routeId } })).active).toBe(false);
    expect(await prisma.tripAttendance.count({ where: { routeId } })).toBe(1);
  });
});
