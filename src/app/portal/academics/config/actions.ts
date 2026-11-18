"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AttendanceCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canForCampus, canOnAll, requireUser, type AuthzContext } from "@/lib/rbac";
import type { PermissionKey } from "@/lib/permissions";
import { parseBands } from "@/lib/grade-bands";

export interface CfgState {
  ok?: boolean;
  error?: string;
  message?: string;
}

export type CfgActionType = (prev: CfgState, formData: FormData) => Promise<CfgState>;
const fail = (error: string): CfgState => ({ error });
const done = (message: string): CfgState => {
  revalidatePath("/portal/academics/config");
  return { ok: true, message };
};
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const date = (f: FormData, k: string) => {
  const d = new Date(str(f, k));
  return Number.isNaN(d.getTime()) ? null : d;
};

// Campus-scoped configuration: the actor needs the permission on that campus.
async function onCampus(f: FormData, perm: PermissionKey) {
  const ctx = await requireUser();
  const campusId = str(f, "campusId");
  if (!ctx.tenantId || !campusId || !canForCampus(ctx, perm, campusId)) return null;
  const campus = await prisma.campus.findFirst({ where: { id: campusId, tenantId: ctx.tenantId }, select: { id: true } });
  return campus ? { ctx, tenantId: ctx.tenantId, campusId } : null;
}

// Tenant-wide configuration (grade scales, attendance codes, leave types) changes
// every campus, so the actor must hold the permission on all of them.
async function onTenant(perm: PermissionKey) {
  const ctx = await requireUser();
  if (!ctx.tenantId) return null;
  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId, status: { not: "CLOSED" } }, select: { id: true } });
  if (!canOnAll(ctx, perm, campuses.map((c) => c.id))) return null;
  return { ctx, tenantId: ctx.tenantId };
}

const denied = fail("You do not have permission to change this configuration.");

async function log(ctx: AuthzContext, action: string, targetType: string, targetId: string, campusId?: string, metadata?: Record<string, unknown>) {
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action,
    targetType,
    targetId,
    campusId,
    scopeType: campusId ? "CAMPUS" : "ORG",
    metadata,
  });
}

// ---- Academic years -------------------------------------------------------

export async function createAcademicYear(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onCampus(f, "academics.write");
  if (!a) return denied;
  const name = str(f, "name"), start = date(f, "startDate"), end = date(f, "endDate");
  if (!name) return fail("Give the academic year a name.");
  if (!start || !end || end <= start) return fail("The end date must be after the start date.");
  const years = await prisma.academicYear.findMany({ where: { campusId: a.campusId } });
  if (years.some((y) => y.name.toLowerCase() === name.toLowerCase())) return fail("This campus already has an academic year with that name.");
  if (years.some((y) => start <= y.endDate && end >= y.startDate)) return fail("These dates overlap another academic year on this campus.");
  const makeCurrent = f.get("isCurrent") === "on" || years.length === 0;
  const year = await prisma.$transaction(async (tx) => {
    if (makeCurrent) await tx.academicYear.updateMany({ where: { campusId: a.campusId }, data: { isCurrent: false } });
    return tx.academicYear.create({ data: { tenantId: a.tenantId, campusId: a.campusId, name, startDate: start, endDate: end, isCurrent: makeCurrent } });
  });
  await log(a.ctx, "academics.year.created", "AcademicYear", year.id, a.campusId, { name });
  return done(`Academic year ${name} created.`);
}

export async function updateAcademicYear(_p: CfgState, f: FormData): Promise<CfgState> {
  const year = await prisma.academicYear.findFirst({ where: { id: str(f, "id") } });
  if (!year) return fail("Academic year not found.");
  f.set("campusId", year.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || year.tenantId !== a.tenantId) return denied;
  const name = str(f, "name"), start = date(f, "startDate"), end = date(f, "endDate");
  if (!name || !start || !end || end <= start) return fail("Enter a name and a valid date range.");
  const others = await prisma.academicYear.findMany({ where: { campusId: year.campusId, NOT: { id: year.id } } });
  if (others.some((y) => start <= y.endDate && end >= y.startDate)) return fail("These dates overlap another academic year on this campus.");
  if (others.some((y) => y.name.toLowerCase() === name.toLowerCase())) return fail("Another academic year already has that name.");
  const terms = await prisma.term.findMany({ where: { academicYearId: year.id } });
  if (terms.some((t) => t.startDate < start || t.endDate > end)) return fail("A term of this year would fall outside the new dates.");
  await prisma.academicYear.update({ where: { id: year.id }, data: { name, startDate: start, endDate: end } });
  await log(a.ctx, "academics.year.updated", "AcademicYear", year.id, year.campusId, { name });
  return done("Academic year updated.");
}

export async function setCurrentAcademicYear(_p: CfgState, f: FormData): Promise<CfgState> {
  const year = await prisma.academicYear.findFirst({ where: { id: str(f, "id") } });
  if (!year) return fail("Academic year not found.");
  f.set("campusId", year.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || year.tenantId !== a.tenantId) return denied;
  await prisma.$transaction([
    prisma.academicYear.updateMany({ where: { campusId: year.campusId }, data: { isCurrent: false } }),
    prisma.academicYear.update({ where: { id: year.id }, data: { isCurrent: true } }),
  ]);
  await log(a.ctx, "academics.year.current", "AcademicYear", year.id, year.campusId);
  return done(`${year.name} is now the current academic year.`);
}

export async function deleteAcademicYear(_p: CfgState, f: FormData): Promise<CfgState> {
  const year = await prisma.academicYear.findFirst({ where: { id: str(f, "id") } });
  if (!year) return fail("Academic year not found.");
  f.set("campusId", year.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || year.tenantId !== a.tenantId) return denied;
  const [sections, enrollments, plans] = await Promise.all([
    prisma.section.count({ where: { academicYearId: year.id } }),
    prisma.enrollment.count({ where: { academicYearId: year.id } }),
    prisma.assessmentPlan.count({ where: { term: { academicYearId: year.id } } }),
  ]);
  if (sections || enrollments || plans) return fail("This year is in use (sections, enrollments or assessment plans). It cannot be deleted.");
  await prisma.academicYear.delete({ where: { id: year.id } });
  await log(a.ctx, "academics.year.deleted", "AcademicYear", year.id, year.campusId, { name: year.name });
  return done("Academic year deleted.");
}

// ---- Terms ----------------------------------------------------------------

export async function createTerm(_p: CfgState, f: FormData): Promise<CfgState> {
  const year = await prisma.academicYear.findFirst({ where: { id: str(f, "academicYearId") } });
  if (!year) return fail("Choose an academic year.");
  f.set("campusId", year.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || year.tenantId !== a.tenantId) return denied;
  const name = str(f, "name"), start = date(f, "startDate"), end = date(f, "endDate");
  if (!name || !start || !end || end <= start) return fail("Enter a name and a valid date range.");
  if (start < year.startDate || end > year.endDate) return fail(`Term dates must fall within ${year.name}.`);
  const terms = await prisma.term.findMany({ where: { academicYearId: year.id } });
  if (terms.some((t) => t.name.toLowerCase() === name.toLowerCase())) return fail("This year already has a term with that name.");
  if (terms.some((t) => start <= t.endDate && end >= t.startDate)) return fail("These dates overlap another term.");
  const term = await prisma.term.create({ data: { tenantId: a.tenantId, academicYearId: year.id, name, startDate: start, endDate: end } });
  await log(a.ctx, "academics.term.created", "Term", term.id, year.campusId, { name });
  return done(`Term ${name} created.`);
}

export async function updateTerm(_p: CfgState, f: FormData): Promise<CfgState> {
  const term = await prisma.term.findFirst({ where: { id: str(f, "id") }, include: { academicYear: true } });
  if (!term) return fail("Term not found.");
  f.set("campusId", term.academicYear.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || term.tenantId !== a.tenantId) return denied;
  const name = str(f, "name"), start = date(f, "startDate"), end = date(f, "endDate");
  if (!name || !start || !end || end <= start) return fail("Enter a name and a valid date range.");
  if (start < term.academicYear.startDate || end > term.academicYear.endDate) return fail("Term dates must fall within the academic year.");
  const others = await prisma.term.findMany({ where: { academicYearId: term.academicYearId, NOT: { id: term.id } } });
  if (others.some((t) => start <= t.endDate && end >= t.startDate)) return fail("These dates overlap another term.");
  await prisma.term.update({ where: { id: term.id }, data: { name, startDate: start, endDate: end } });
  await log(a.ctx, "academics.term.updated", "Term", term.id, term.academicYear.campusId, { name });
  return done("Term updated.");
}

export async function deleteTerm(_p: CfgState, f: FormData): Promise<CfgState> {
  const term = await prisma.term.findFirst({ where: { id: str(f, "id") }, include: { academicYear: true } });
  if (!term) return fail("Term not found.");
  f.set("campusId", term.academicYear.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || term.tenantId !== a.tenantId) return denied;
  if (await prisma.assessmentPlan.count({ where: { termId: term.id } })) return fail("Assessment plans use this term. It cannot be deleted.");
  await prisma.term.delete({ where: { id: term.id } });
  await log(a.ctx, "academics.term.deleted", "Term", term.id, term.academicYear.campusId, { name: term.name });
  return done("Term deleted.");
}

// ---- Grade levels ---------------------------------------------------------

export async function createGradeLevel(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onCampus(f, "academics.write");
  if (!a) return denied;
  const name = str(f, "name");
  const rank = Number(str(f, "rank") || 0);
  if (!name) return fail("Give the grade a name.");
  if (!Number.isInteger(rank) || rank < 0) return fail("Order must be a whole number of 0 or more.");
  const dup = await prisma.gradeLevel.findFirst({ where: { campusId: a.campusId, name: { equals: name, mode: "insensitive" } } });
  if (dup) return fail("This campus already has a grade with that name.");
  const grade = await prisma.gradeLevel.create({ data: { tenantId: a.tenantId, campusId: a.campusId, name, rank } });
  await log(a.ctx, "academics.grade.created", "GradeLevel", grade.id, a.campusId, { name });
  return done(`Grade ${name} created.`);
}

export async function updateGradeLevel(_p: CfgState, f: FormData): Promise<CfgState> {
  const grade = await prisma.gradeLevel.findFirst({ where: { id: str(f, "id") } });
  if (!grade) return fail("Grade not found.");
  f.set("campusId", grade.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || grade.tenantId !== a.tenantId) return denied;
  const name = str(f, "name"), rank = Number(str(f, "rank") || 0);
  if (!name || !Number.isInteger(rank) || rank < 0) return fail("Enter a name and a whole-number order.");
  const dup = await prisma.gradeLevel.findFirst({ where: { campusId: grade.campusId, name: { equals: name, mode: "insensitive" }, NOT: { id: grade.id } } });
  if (dup) return fail("Another grade already has that name.");
  await prisma.gradeLevel.update({ where: { id: grade.id }, data: { name, rank } });
  await log(a.ctx, "academics.grade.updated", "GradeLevel", grade.id, grade.campusId, { name });
  return done("Grade updated.");
}

export async function deleteGradeLevel(_p: CfgState, f: FormData): Promise<CfgState> {
  const grade = await prisma.gradeLevel.findFirst({ where: { id: str(f, "id") } });
  if (!grade) return fail("Grade not found.");
  f.set("campusId", grade.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || grade.tenantId !== a.tenantId) return denied;
  const [sections, enrollments, fees, apps] = await Promise.all([
    prisma.section.count({ where: { gradeLevelId: grade.id } }),
    prisma.enrollment.count({ where: { gradeLevelId: grade.id } }),
    prisma.feeStructure.count({ where: { gradeLevelId: grade.id } }),
    prisma.application.count({ where: { gradeLevelId: grade.id } }),
  ]);
  if (sections || enrollments || fees || apps) return fail("This grade is in use (sections, enrollments, fee structures or applications). It cannot be deleted.");
  await prisma.gradeLevel.delete({ where: { id: grade.id } });
  await log(a.ctx, "academics.grade.deleted", "GradeLevel", grade.id, grade.campusId, { name: grade.name });
  return done("Grade deleted.");
}

// ---- Sections -------------------------------------------------------------

export async function createSection(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onCampus(f, "academics.write");
  if (!a) return denied;
  const name = str(f, "name"), capacity = Number(str(f, "capacity") || 40);
  if (!name) return fail("Give the section a name.");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return fail("Capacity must be between 1 and 500.");
  const [grade, year] = await Promise.all([
    prisma.gradeLevel.findFirst({ where: { id: str(f, "gradeLevelId"), campusId: a.campusId } }),
    prisma.academicYear.findFirst({ where: { id: str(f, "academicYearId"), campusId: a.campusId } }),
  ]);
  if (!grade || !year) return fail("Choose a grade and an academic year on this campus.");
  const homeroomStaffId = str(f, "homeroomStaffId") || null;
  if (homeroomStaffId && !(await prisma.employmentRecord.findFirst({ where: { staffId: homeroomStaffId, campusId: a.campusId, endDate: null } })))
    return fail("The class teacher must be current staff on this campus.");
  const dup = await prisma.section.findFirst({ where: { campusId: a.campusId, gradeLevelId: grade.id, academicYearId: year.id, name: { equals: name, mode: "insensitive" } } });
  if (dup) return fail(`${grade.name} already has a section named ${name} in ${year.name}.`);
  const section = await prisma.section.create({ data: { tenantId: a.tenantId, campusId: a.campusId, gradeLevelId: grade.id, academicYearId: year.id, name, capacity, homeroomStaffId } });
  await log(a.ctx, "academics.section.created", "Section", section.id, a.campusId, { name, grade: grade.name });
  return done(`Section ${grade.name} · ${name} created.`);
}

export async function updateSection(_p: CfgState, f: FormData): Promise<CfgState> {
  const section = await prisma.section.findFirst({ where: { id: str(f, "id") } });
  if (!section) return fail("Section not found.");
  f.set("campusId", section.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || section.tenantId !== a.tenantId) return denied;
  const name = str(f, "name"), capacity = Number(str(f, "capacity") || 0);
  if (!name || !Number.isInteger(capacity) || capacity < 1 || capacity > 500) return fail("Enter a name and a capacity between 1 and 500.");
  const enrolled = await prisma.enrollment.count({ where: { sectionId: section.id, status: "ACTIVE" } });
  if (capacity < enrolled) return fail(`${enrolled} students are enrolled; capacity cannot be lower.`);
  const homeroomStaffId = str(f, "homeroomStaffId") || null;
  if (homeroomStaffId && !(await prisma.employmentRecord.findFirst({ where: { staffId: homeroomStaffId, campusId: section.campusId, endDate: null } })))
    return fail("The class teacher must be current staff on this campus.");
  const dup = await prisma.section.findFirst({ where: { campusId: section.campusId, gradeLevelId: section.gradeLevelId, academicYearId: section.academicYearId, name: { equals: name, mode: "insensitive" }, NOT: { id: section.id } } });
  if (dup) return fail("Another section of this grade already has that name.");
  await prisma.section.update({ where: { id: section.id }, data: { name, capacity, homeroomStaffId } });
  await log(a.ctx, "academics.section.updated", "Section", section.id, section.campusId, { name });
  return done("Section updated.");
}

export async function deleteSection(_p: CfgState, f: FormData): Promise<CfgState> {
  const section = await prisma.section.findFirst({ where: { id: str(f, "id") } });
  if (!section) return fail("Section not found.");
  f.set("campusId", section.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || section.tenantId !== a.tenantId) return denied;
  const [enr, att, plans, slots] = await Promise.all([
    prisma.enrollment.count({ where: { sectionId: section.id } }),
    prisma.attendanceSession.count({ where: { sectionId: section.id } }),
    prisma.assessmentPlan.count({ where: { sectionId: section.id } }),
    prisma.timetableSlot.count({ where: { sectionId: section.id } }),
  ]);
  if (enr || att || plans || slots) return fail("This section has enrollments, attendance, assessments or timetable slots. It cannot be deleted.");
  await prisma.section.delete({ where: { id: section.id } });
  await log(a.ctx, "academics.section.deleted", "Section", section.id, section.campusId, { name: section.name });
  return done("Section deleted.");
}

// ---- Subjects -------------------------------------------------------------

export async function createSubject(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onCampus(f, "academics.write");
  if (!a) return denied;
  const code = str(f, "code").toUpperCase().replace(/[^A-Z0-9-]/g, "-"), name = str(f, "name");
  if (!code || !name) return fail("Enter a code and a name.");
  if (await prisma.subject.findUnique({ where: { tenantId_code: { tenantId: a.tenantId, code } } })) return fail(`A subject with code ${code} already exists.`);
  const subject = await prisma.subject.create({ data: { tenantId: a.tenantId, campusId: a.campusId, code, name } });
  await log(a.ctx, "academics.subject.created", "Subject", subject.id, a.campusId, { code, name });
  return done(`Subject ${name} created.`);
}

export async function updateSubject(_p: CfgState, f: FormData): Promise<CfgState> {
  const subject = await prisma.subject.findFirst({ where: { id: str(f, "id") } });
  if (!subject || !subject.campusId) return fail("Subject not found.");
  f.set("campusId", subject.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || subject.tenantId !== a.tenantId) return denied;
  const code = str(f, "code").toUpperCase().replace(/[^A-Z0-9-]/g, "-"), name = str(f, "name");
  if (!code || !name) return fail("Enter a code and a name.");
  const dup = await prisma.subject.findFirst({ where: { tenantId: a.tenantId, code, NOT: { id: subject.id } } });
  if (dup) return fail(`A subject with code ${code} already exists.`);
  await prisma.subject.update({ where: { id: subject.id }, data: { code, name } });
  await log(a.ctx, "academics.subject.updated", "Subject", subject.id, subject.campusId, { code, name });
  return done("Subject updated.");
}

export async function deleteSubject(_p: CfgState, f: FormData): Promise<CfgState> {
  const subject = await prisma.subject.findFirst({ where: { id: str(f, "id") } });
  if (!subject || !subject.campusId) return fail("Subject not found.");
  f.set("campusId", subject.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || subject.tenantId !== a.tenantId) return denied;
  const [plans, marks, slots, assignments] = await Promise.all([
    prisma.planSubject.count({ where: { subjectId: subject.id } }),
    prisma.markEntry.count({ where: { subjectId: subject.id } }),
    prisma.timetableSlot.count({ where: { subjectId: subject.id } }),
    prisma.teacherAssignment.count({ where: { subjectId: subject.id } }),
  ]);
  if (plans || marks || slots || assignments) return fail("This subject is in use (assessments, marks, timetable or teaching assignments). It cannot be deleted.");
  await prisma.subject.delete({ where: { id: subject.id } });
  await log(a.ctx, "academics.subject.deleted", "Subject", subject.id, subject.campusId, { code: subject.code });
  return done("Subject deleted.");
}

// ---- Rooms ----------------------------------------------------------------

const ROOM_TYPES = ["CLASSROOM", "LAB", "LIBRARY", "HALL", "SPORTS", "OTHER"];

export async function createRoom(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onCampus(f, "academics.write");
  if (!a) return denied;
  const code = str(f, "code").toUpperCase(), name = str(f, "name") || code, capacity = Number(str(f, "capacity") || 30), roomType = str(f, "roomType") || "CLASSROOM";
  if (!code) return fail("Enter a room code.");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 5000) return fail("Capacity must be between 1 and 5000.");
  if (!ROOM_TYPES.includes(roomType)) return fail("Choose a room type.");
  if (await prisma.room.findUnique({ where: { campusId_code: { campusId: a.campusId, code } } })) return fail(`This campus already has room ${code}.`);
  const room = await prisma.room.create({ data: { tenantId: a.tenantId, campusId: a.campusId, code, name, capacity, roomType } });
  await log(a.ctx, "academics.room.created", "Room", room.id, a.campusId, { code });
  return done(`Room ${code} created.`);
}

export async function updateRoom(_p: CfgState, f: FormData): Promise<CfgState> {
  const room = await prisma.room.findFirst({ where: { id: str(f, "id") } });
  if (!room) return fail("Room not found.");
  f.set("campusId", room.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || room.tenantId !== a.tenantId) return denied;
  const name = str(f, "name"), capacity = Number(str(f, "capacity") || 0), roomType = str(f, "roomType");
  if (!name || !Number.isInteger(capacity) || capacity < 1 || !ROOM_TYPES.includes(roomType)) return fail("Enter a name, a capacity and a room type.");
  await prisma.room.update({ where: { id: room.id }, data: { name, capacity, roomType } });
  await log(a.ctx, "academics.room.updated", "Room", room.id, room.campusId, { code: room.code });
  return done("Room updated.");
}

export async function deleteRoom(_p: CfgState, f: FormData): Promise<CfgState> {
  const room = await prisma.room.findFirst({ where: { id: str(f, "id") } });
  if (!room) return fail("Room not found.");
  f.set("campusId", room.campusId);
  const a = await onCampus(f, "academics.write");
  if (!a || room.tenantId !== a.tenantId) return denied;
  if (await prisma.timetableSlot.count({ where: { roomId: room.id } })) return fail("Timetable slots use this room. It cannot be deleted.");
  await prisma.room.delete({ where: { id: room.id } });
  await log(a.ctx, "academics.room.deleted", "Room", room.id, room.campusId, { code: room.code });
  return done("Room deleted.");
}

// ---- Grade scales (tenant-wide) -------------------------------------------

export async function createGradeScale(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onTenant("exams.manage");
  if (!a) return denied;
  const name = str(f, "name");
  if (!name) return fail("Give the grade scale a name.");
  const parsed = parseBands(String(f.get("bands") ?? ""));
  if (parsed.error) return fail(parsed.error);
  if (await prisma.gradeScale.findFirst({ where: { tenantId: a.tenantId, name: { equals: name, mode: "insensitive" } } })) return fail("A grade scale with that name already exists.");
  const scale = await prisma.gradeScale.create({ data: { tenantId: a.tenantId, name, bands: { create: parsed.bands!.map((b) => ({ tenantId: a.tenantId, ...b })) } } });
  await log(a.ctx, "academics.gradescale.created", "GradeScale", scale.id, undefined, { name, bands: parsed.bands!.length });
  return done(`Grade scale ${name} created.`);
}

export async function deleteGradeScale(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onTenant("exams.manage");
  if (!a) return denied;
  const scale = await prisma.gradeScale.findFirst({ where: { id: str(f, "id"), tenantId: a.tenantId } });
  if (!scale) return fail("Grade scale not found.");
  if (await prisma.assessmentPlan.count({ where: { gradeScaleId: scale.id } })) return fail("Assessment plans use this scale. It cannot be deleted.");
  await prisma.gradeScale.delete({ where: { id: scale.id } });
  await log(a.ctx, "academics.gradescale.deleted", "GradeScale", scale.id, undefined, { name: scale.name });
  return done("Grade scale deleted.");
}

// ---- Attendance codes (tenant-wide) ---------------------------------------

const CATEGORIES: AttendanceCategory[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED", "LEAVE", "REMOTE"];

const codeSchema = z.object({
  code: z.string().trim().min(1).max(4),
  label: z.string().trim().min(1).max(40),
  category: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED", "LEAVE", "REMOTE"]),
});

export async function createAttendanceCode(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onTenant("attendance.write");
  if (!a) return denied;
  const parsed = codeSchema.safeParse({ code: str(f, "code").toUpperCase(), label: str(f, "label"), category: str(f, "category") });
  if (!parsed.success) return fail("Enter a code (up to 4 characters), a label and a category.");
  const d = parsed.data;
  if (await prisma.attendanceCode.findUnique({ where: { tenantId_code: { tenantId: a.tenantId, code: d.code } } })) return fail(`Code ${d.code} already exists.`);
  const created = await prisma.attendanceCode.create({
    data: { tenantId: a.tenantId, ...d, countsAsPresent: f.get("countsAsPresent") === "on", notifyGuardian: f.get("notifyGuardian") === "on" },
  });
  await log(a.ctx, "attendance.code.created", "AttendanceCode", created.id, undefined, { code: d.code });
  return done(`Attendance code ${d.code} created.`);
}

export async function updateAttendanceCode(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onTenant("attendance.write");
  if (!a) return denied;
  const code = await prisma.attendanceCode.findFirst({ where: { id: str(f, "id"), tenantId: a.tenantId } });
  if (!code) return fail("Attendance code not found.");
  const label = str(f, "label"), category = str(f, "category") as AttendanceCategory;
  if (!label || !CATEGORIES.includes(category)) return fail("Enter a label and a category.");
  await prisma.attendanceCode.update({ where: { id: code.id }, data: { label, category, countsAsPresent: f.get("countsAsPresent") === "on", notifyGuardian: f.get("notifyGuardian") === "on" } });
  await log(a.ctx, "attendance.code.updated", "AttendanceCode", code.id, undefined, { code: code.code });
  return done("Attendance code updated.");
}

export async function deleteAttendanceCode(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onTenant("attendance.write");
  if (!a) return denied;
  const code = await prisma.attendanceCode.findFirst({ where: { id: str(f, "id"), tenantId: a.tenantId } });
  if (!code) return fail("Attendance code not found.");
  if (await prisma.attendanceRecord.count({ where: { codeId: code.id } })) return fail("Attendance records use this code. It cannot be deleted.");
  await prisma.attendanceCode.delete({ where: { id: code.id } });
  await log(a.ctx, "attendance.code.deleted", "AttendanceCode", code.id, undefined, { code: code.code });
  return done("Attendance code deleted.");
}

// ---- Leave types (tenant-wide) --------------------------------------------

export async function createLeaveType(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onTenant("hr.staff.write");
  if (!a) return denied;
  const name = str(f, "name"), daysPerYear = Number(str(f, "daysPerYear") || 0), appliesTo = str(f, "appliesTo") || "STAFF";
  if (!name) return fail("Give the leave type a name.");
  if (!Number.isFinite(daysPerYear) || daysPerYear < 0 || daysPerYear > 366) return fail("Days per year must be between 0 and 366.");
  if (!["STAFF", "STUDENT", "BOTH"].includes(appliesTo)) return fail("Choose who the leave type applies to.");
  if (await prisma.leaveType.findUnique({ where: { tenantId_name: { tenantId: a.tenantId, name } } })) return fail("A leave type with that name already exists.");
  const lt = await prisma.leaveType.create({ data: { tenantId: a.tenantId, name, daysPerYear, appliesTo, isPaid: f.get("isPaid") === "on" } });
  await log(a.ctx, "hr.leavetype.created", "LeaveType", lt.id, undefined, { name });
  return done(`Leave type ${name} created.`);
}

export async function deleteLeaveType(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onTenant("hr.staff.write");
  if (!a) return denied;
  const lt = await prisma.leaveType.findFirst({ where: { id: str(f, "id"), tenantId: a.tenantId } });
  if (!lt) return fail("Leave type not found.");
  const [b, r] = await Promise.all([prisma.leaveBalance.count({ where: { leaveTypeId: lt.id } }), prisma.leaveRequest.count({ where: { leaveTypeId: lt.id } })]);
  if (b || r) return fail("Leave balances or requests use this type. It cannot be deleted.");
  await prisma.leaveType.delete({ where: { id: lt.id } });
  await log(a.ctx, "hr.leavetype.deleted", "LeaveType", lt.id, undefined, { name: lt.name });
  return done("Leave type deleted.");
}

// ---- Departments and positions --------------------------------------------

export async function createDepartment(_p: CfgState, f: FormData): Promise<CfgState> {
  const a = await onCampus(f, "hr.staff.write");
  if (!a) return denied;
  const name = str(f, "name");
  if (!name) return fail("Give the department a name.");
  if (await prisma.department.findFirst({ where: { campusId: a.campusId, name: { equals: name, mode: "insensitive" } } })) return fail("This campus already has that department.");
  const d = await prisma.department.create({ data: { tenantId: a.tenantId, campusId: a.campusId, name } });
  await log(a.ctx, "hr.department.created", "Department", d.id, a.campusId, { name });
  return done(`Department ${name} created.`);
}

export async function deleteDepartment(_p: CfgState, f: FormData): Promise<CfgState> {
  const dep = await prisma.department.findFirst({ where: { id: str(f, "id") } });
  if (!dep) return fail("Department not found.");
  f.set("campusId", dep.campusId);
  const a = await onCampus(f, "hr.staff.write");
  if (!a || dep.tenantId !== a.tenantId) return denied;
  if (await prisma.position.count({ where: { departmentId: dep.id } })) return fail("Remove this department's positions first.");
  await prisma.department.delete({ where: { id: dep.id } });
  await log(a.ctx, "hr.department.deleted", "Department", dep.id, dep.campusId, { name: dep.name });
  return done("Department deleted.");
}

export async function createPosition(_p: CfgState, f: FormData): Promise<CfgState> {
  const dep = await prisma.department.findFirst({ where: { id: str(f, "departmentId") } });
  if (!dep) return fail("Choose a department.");
  f.set("campusId", dep.campusId);
  const a = await onCampus(f, "hr.staff.write");
  if (!a || dep.tenantId !== a.tenantId) return denied;
  const title = str(f, "title");
  if (!title) return fail("Give the position a title.");
  if (await prisma.position.findFirst({ where: { departmentId: dep.id, title: { equals: title, mode: "insensitive" } } })) return fail("This department already has that position.");
  const p = await prisma.position.create({ data: { tenantId: a.tenantId, departmentId: dep.id, title } });
  await log(a.ctx, "hr.position.created", "Position", p.id, dep.campusId, { title });
  return done(`Position ${title} created.`);
}

export async function deletePosition(_p: CfgState, f: FormData): Promise<CfgState> {
  const pos = await prisma.position.findFirst({ where: { id: str(f, "id") }, include: { department: true } });
  if (!pos) return fail("Position not found.");
  f.set("campusId", pos.department.campusId);
  const a = await onCampus(f, "hr.staff.write");
  if (!a || pos.tenantId !== a.tenantId) return denied;
  const [emp, jobs] = await Promise.all([prisma.employmentRecord.count({ where: { positionId: pos.id } }), prisma.jobOpening.count({ where: { positionId: pos.id } })]);
  if (emp || jobs) return fail("Staff records or job openings use this position. It cannot be deleted.");
  await prisma.position.delete({ where: { id: pos.id } });
  await log(a.ctx, "hr.position.deleted", "Position", pos.id, pos.department.campusId, { title: pos.title });
  return done("Position deleted.");
}
