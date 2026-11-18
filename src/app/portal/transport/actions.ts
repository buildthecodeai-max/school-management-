"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { parseDay } from "@/lib/attendance";
import { dayStart } from "@/lib/dates";
import { isTripStatus, canAssign } from "@/lib/transport";

export interface TransportActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const text = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);

async function routeFor(ctx: Awaited<ReturnType<typeof requireUser>>, routeId: string) {
  return prisma.route.findFirst({
    where: { id: routeId, tenantId: ctx.tenantId! },
    include: { vehicle: true, _count: { select: { assignments: true } } },
  });
}

// ---- fleet ---------------------------------------------------------------

export async function createVehicle(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId");
  if (!canForCampus(ctx, "transport.write", campusId)) return { error: "Permission denied." };
  const campus = await prisma.campus.findFirst({ where: { id: campusId, tenantId: ctx.tenantId! }, select: { id: true } });
  if (!campus) return { error: "Campus not found." };
  const regNumber = text(f, "regNumber", 30).toUpperCase();
  if (!regNumber) return { error: "Enter the registration number." };
  const capacity = Number(f.get("capacity"));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) return { error: "Capacity must be a whole number from 1 to 200." };
  const driverStaffId = text(f, "driverStaffId") || null;
  if (driverStaffId) {
    const ok = await prisma.staff.findFirst({ where: { id: driverStaffId, tenantId: ctx.tenantId!, employmentRecords: { some: { campusId } } }, select: { id: true } });
    if (!ok) return { error: "That driver does not work at this campus." };
  }
  if (await prisma.vehicle.findFirst({ where: { tenantId: ctx.tenantId!, regNumber } })) return { error: `Vehicle ${regNumber} already exists.` };
  const v = await prisma.vehicle.create({
    data: { tenantId: ctx.tenantId!, campusId, regNumber, model: text(f, "model", 60) || null, capacity, driverStaffId },
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.vehicle.created", targetType: "Vehicle", targetId: v.id, campusId, metadata: { regNumber, capacity } });
  revalidatePath("/portal/transport");
  return { ok: true, message: `Vehicle ${regNumber} added.` };
}

export async function deleteVehicle(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const v = await prisma.vehicle.findFirst({ where: { id: text(f, "vehicleId"), tenantId: ctx.tenantId! }, include: { _count: { select: { routes: true } } } });
  if (!v) return { error: "Vehicle not found." };
  if (!canForCampus(ctx, "transport.write", v.campusId)) return { error: "Permission denied." };
  if (v._count.routes > 0) return { error: "This vehicle is used by a route. Reassign the route first." };
  await prisma.vehicle.delete({ where: { id: v.id } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.vehicle.deleted", targetType: "Vehicle", targetId: v.id, campusId: v.campusId, metadata: { regNumber: v.regNumber } });
  revalidatePath("/portal/transport");
  return { ok: true, message: "Vehicle removed." };
}

// ---- routes, stops, assignments -------------------------------------------

export async function createRoute(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId");
  if (!canForCampus(ctx, "transport.write", campusId)) return { error: "Permission denied." };
  const name = text(f, "name", 80);
  if (!name) return { error: "Enter a route name." };
  const vehicleId = text(f, "vehicleId") || null;
  if (vehicleId && !(await prisma.vehicle.findFirst({ where: { id: vehicleId, tenantId: ctx.tenantId!, campusId }, select: { id: true } })))
    return { error: "Vehicle not found on this campus." };
  if (await prisma.route.findFirst({ where: { tenantId: ctx.tenantId!, campusId, name, active: true } })) return { error: `A route named "${name}" already exists.` };
  const r = await prisma.route.create({ data: { tenantId: ctx.tenantId!, campusId, name, vehicleId } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.route.created", targetType: "Route", targetId: r.id, campusId, metadata: { name } });
  revalidatePath("/portal/transport");
  return { ok: true, message: `Route "${name}" created.` };
}

export async function deactivateRoute(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const r = await routeFor(ctx, text(f, "routeId"));
  if (!r) return { error: "Route not found." };
  if (!canForCampus(ctx, "transport.write", r.campusId)) return { error: "Permission denied." };
  await prisma.route.update({ where: { id: r.id }, data: { active: false } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.route.deactivated", targetType: "Route", targetId: r.id, campusId: r.campusId });
  revalidatePath("/portal/transport");
  return { ok: true, message: "Route deactivated. Trip history is kept." };
}

export async function addStop(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const r = await routeFor(ctx, text(f, "routeId"));
  if (!r) return { error: "Route not found." };
  if (!canForCampus(ctx, "transport.write", r.campusId)) return { error: "Permission denied." };
  const name = text(f, "name", 80);
  if (!name) return { error: "Enter the stop name." };
  const last = await prisma.stop.findFirst({ where: { routeId: r.id }, orderBy: { order: "desc" } });
  await prisma.stop.create({ data: { tenantId: ctx.tenantId!, routeId: r.id, name, order: (last?.order ?? 0) + 1 } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.stop.added", targetType: "Route", targetId: r.id, campusId: r.campusId, metadata: { name } });
  revalidatePath("/portal/transport");
  return { ok: true, message: "Stop added." };
}

export async function removeStop(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const stop = await prisma.stop.findFirst({ where: { id: text(f, "stopId"), tenantId: ctx.tenantId! }, include: { route: true } });
  if (!stop) return { error: "Stop not found." };
  if (!canForCampus(ctx, "transport.write", stop.route.campusId)) return { error: "Permission denied." };
  const used = await prisma.routeAssignment.count({ where: { routeId: stop.routeId, OR: [{ boardingStopId: stop.id }, { alightingStopId: stop.id }] } });
  if (used > 0) return { error: `${used} student(s) use this stop. Move them first.` };
  await prisma.$transaction(async (tx) => {
    await tx.stop.delete({ where: { id: stop.id } });
    const rest = await tx.stop.findMany({ where: { routeId: stop.routeId }, orderBy: { order: "asc" } });
    for (const [i, s] of rest.entries()) if (s.order !== i + 1) await tx.stop.update({ where: { id: s.id }, data: { order: i + 1 } });
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.stop.removed", targetType: "Route", targetId: stop.routeId, campusId: stop.route.campusId, metadata: { name: stop.name } });
  revalidatePath("/portal/transport");
  return { ok: true, message: "Stop removed." };
}

export async function assignStudentToRoute(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const r = await routeFor(ctx, text(f, "routeId"));
  if (!r) return { error: "Route not found." };
  if (!canForCampus(ctx, "transport.write", r.campusId)) return { error: "Permission denied." };
  const admissionNumber = text(f, "admissionNumber", 50);
  const student = await prisma.student.findFirst({
    where: { tenantId: ctx.tenantId!, admissionNumber, enrollments: { some: { campusId: r.campusId, status: "ACTIVE" } } },
    include: { person: true },
  });
  if (!student) return { error: "No actively enrolled student with that admission number on this campus." };
  const existing = await prisma.routeAssignment.findFirst({ where: { tenantId: ctx.tenantId!, studentId: student.id, route: { active: true } }, include: { route: true } });
  if (existing) return { error: `${student.person.firstName} is already on route "${existing.route.name}".` };
  if (!canAssign(r.vehicle?.capacity, r._count.assignments)) return { error: `The vehicle (${r.vehicle?.regNumber}) is full.` };
  const stopId = text(f, "stopId") || null;
  if (stopId && !(await prisma.stop.findFirst({ where: { id: stopId, routeId: r.id }, select: { id: true } }))) return { error: "That stop is not on this route." };
  await prisma.routeAssignment.create({ data: { tenantId: ctx.tenantId!, routeId: r.id, studentId: student.id, boardingStopId: stopId, alightingStopId: stopId } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.assignment.created", targetType: "Route", targetId: r.id, campusId: r.campusId, metadata: { studentId: student.id } });
  revalidatePath("/portal/transport");
  return { ok: true, message: `${student.person.firstName} ${student.person.lastName} assigned to ${r.name}.` };
}

export async function removeRouteAssignment(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const a = await prisma.routeAssignment.findFirst({ where: { id: text(f, "assignmentId"), tenantId: ctx.tenantId! }, include: { route: true } });
  if (!a) return { error: "Assignment not found." };
  if (!canForCampus(ctx, "transport.write", a.route.campusId)) return { error: "Permission denied." };
  await prisma.routeAssignment.delete({ where: { id: a.id } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.assignment.removed", targetType: "Route", targetId: a.routeId, campusId: a.route.campusId, metadata: { studentId: a.studentId } });
  revalidatePath("/portal/transport");
  return { ok: true, message: "Student removed from the route." };
}

// ---- trip attendance -------------------------------------------------------

export async function recordTrip(_p: TransportActionState, f: FormData): Promise<TransportActionState> {
  const ctx = await requireUser();
  const route = await routeFor(ctx, text(f, "routeId"));
  if (!route || !route.active) return { error: "Route not found." };
  // The campus comes from the route, never from the form.
  const campusId = route.campusId;
  if (!canForCampus(ctx, "transport.trip.record", campusId)) return { error: "Permission denied." };

  const direction = text(f, "direction");
  if (!["MORNING", "AFTERNOON", "OTHER"].includes(direction)) return { error: "Choose the trip direction." };
  const day = parseDay(text(f, "tripDate"));
  if (!day) return { error: "Choose a valid date." };
  if (day > dayStart()) return { error: "You cannot record a trip in the future." };

  let raw: { studentId: string; status: string }[];
  try {
    raw = JSON.parse(String(f.get("records") ?? "[]"));
    if (!Array.isArray(raw) || raw.length === 0) throw new Error();
  } catch {
    return { error: "There are no students to record." };
  }
  const assigned = new Set((await prisma.routeAssignment.findMany({ where: { routeId: route.id }, select: { studentId: true } })).map((a) => a.studentId));
  const seen = new Set<string>();
  for (const r of raw) {
    if (!isTripStatus(r.status)) return { error: "Every student needs a valid status." };
    if (!assigned.has(r.studentId)) return { error: "The list includes a student who is not on this route." };
    if (seen.has(r.studentId)) return { error: "A student appears twice in the list." };
    seen.add(r.studentId);
  }
  if (await prisma.tripAttendance.findFirst({ where: { tenantId: ctx.tenantId!, routeId: route.id, tripDate: day, direction: direction as never } }))
    return { error: "This trip has already been recorded." };

  const trip = await prisma.tripAttendance.create({
    data: { tenantId: ctx.tenantId!, routeId: route.id, tripDate: day, direction: direction as never, records: raw, recordedByUserId: ctx.user.id },
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "transport.trip.recorded", targetType: "TripAttendance", targetId: trip.id, campusId, metadata: { routeId: route.id, direction, count: raw.length } });

  // Alert guardians of BOARDED / ABSENT students (deduplicated per trip).
  const boarded = new Set(raw.filter((r) => r.status === "BOARDED").map((r) => r.studentId));
  const alertIds = raw.filter((r) => r.status === "BOARDED" || r.status === "ABSENT").map((r) => r.studentId);
  if (alertIds.length > 0) {
    const links = await prisma.guardianRelationship.findMany({
      where: { tenantId: ctx.tenantId!, studentId: { in: alertIds }, receivesNotifications: true },
      include: { guardian: { include: { person: { include: { user: true } } } }, student: { include: { person: true } } },
    });
    for (const link of links) {
      const u = link.guardian.person.user;
      if (!u) continue;
      const name = `${link.student.person.firstName} ${link.student.person.lastName}`;
      await notify({
        tenantId: ctx.tenantId!,
        recipientUserId: u.id,
        category: "ATTENDANCE",
        title: `Transport update — ${name}`,
        body: `${name} has ${boarded.has(link.studentId) ? "boarded" : "been marked absent from"} the ${direction.toLowerCase()} bus on ${day.toLocaleDateString()}.`,
        dataClassification: "INTERNAL",
        dedupeKey: `transport-${trip.id}-${link.studentId}-${u.id}`,
      });
    }
  }
  revalidatePath("/portal/transport");
  return { ok: true, message: `Trip recorded for ${raw.length} student(s).` };
}
