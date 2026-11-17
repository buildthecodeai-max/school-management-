"use server";

import { prisma } from "@/lib/db";
import { requireUser, canForCampus, assertPermission } from "@/lib/rbac";
import { allowedCampusIds } from "@/lib/scope";
import { audit } from "@/lib/audit";
import { checkLimit } from "@/lib/entitlements";
import type { Gender } from "@prisma/client";

export interface ImportRow {
  firstName?: string;
  lastName?: string;
  admissionNumber?: string;
  campus?: string;
  grade?: string;
  section?: string;
  gender?: string;
  dateOfBirth?: string;
  guardianName?: string;
  guardianEmail?: string;
}

interface Resolved {
  campusId: string;
  gradeLevelId: string;
  sectionId: string;
  academicYearId: string;
}

export interface RowResult {
  index: number;
  data: ImportRow;
  errors: string[];
  resolved?: Resolved;
}

export interface ImportPreview {
  rows: RowResult[];
  summary: { total: number; valid: number; invalid: number };
  error?: string;
}

const GENDERS = ["MALE", "FEMALE", "OTHER", "UNDISCLOSED"];
const MAX_ROWS = 500;

// Build the tenant-scoped resolution context (campuses/grades/sections the
// importer is allowed to write to) and validate every row.
async function validate(
  ctx: Awaited<ReturnType<typeof requireUser>>,
  rows: ImportRow[],
): Promise<ImportPreview> {
  if (rows.length === 0) return { rows: [], summary: { total: 0, valid: 0, invalid: 0 } };
  if (rows.length > MAX_ROWS)
    return { rows: [], summary: { total: rows.length, valid: 0, invalid: rows.length }, error: `Too many rows (max ${MAX_ROWS}).` };

  const campusIds = allowedCampusIds(ctx, "data.import");
  const campuses = await prisma.campus.findMany({
    where: {
      tenantId: ctx.tenantId!,
      status: "ACTIVE",
      ...(campusIds ? { id: { in: campusIds } } : {}),
    },
    include: {
      gradeLevels: true,
      academicYears: { where: { isCurrent: true }, include: { sections: { include: { gradeLevel: true } } } },
    },
  });

  // Resolution maps
  const campusByKey = new Map<string, (typeof campuses)[number]>();
  for (const c of campuses) {
    campusByKey.set(c.code.toLowerCase(), c);
    campusByKey.set(c.name.toLowerCase(), c);
  }

  // Existing admission numbers for the tenant (dup check).
  const existing = await prisma.student.findMany({
    where: { tenantId: ctx.tenantId! },
    select: { admissionNumber: true },
  });
  const existingAdm = new Set(existing.map((e) => e.admissionNumber.toLowerCase()));
  const seen = new Set<string>();

  const results: RowResult[] = rows.map((data, index) => {
    const errors: string[] = [];
    const req: [keyof ImportRow, string][] = [
      ["firstName", "First name"],
      ["lastName", "Last name"],
      ["admissionNumber", "Admission number"],
      ["campus", "Campus"],
      ["grade", "Grade"],
      ["section", "Section"],
    ];
    for (const [k, label] of req) {
      if (!data[k]?.trim()) errors.push(`${label} is required`);
    }

    let resolved: Resolved | undefined;
    const campus = data.campus ? campusByKey.get(data.campus.trim().toLowerCase()) : undefined;
    if (data.campus && !campus) errors.push(`Unknown campus "${data.campus}"`);

    if (campus && data.grade) {
      const grade = campus.gradeLevels.find(
        (g) => g.name.toLowerCase() === data.grade!.trim().toLowerCase(),
      );
      if (!grade) errors.push(`Unknown grade "${data.grade}" at ${campus.name}`);

      const year = campus.academicYears[0];
      if (!year) errors.push(`No current academic year at ${campus.name}`);

      if (grade && year && data.section) {
        const section = year.sections.find(
          (s) =>
            s.gradeLevelId === grade.id &&
            s.name.toLowerCase() === data.section!.trim().toLowerCase(),
        );
        if (!section) errors.push(`Unknown section "${data.section}" for ${data.grade}`);
        else resolved = { campusId: campus.id, gradeLevelId: grade.id, sectionId: section.id, academicYearId: year.id };
      }
    }

    // Admission number dup (DB + within file)
    const adm = data.admissionNumber?.trim().toLowerCase();
    if (adm) {
      if (existingAdm.has(adm)) errors.push(`Admission number "${data.admissionNumber}" already exists`);
      if (seen.has(adm)) errors.push(`Duplicate admission number "${data.admissionNumber}" in this file`);
      seen.add(adm);
    }

    if (data.gender && !GENDERS.includes(data.gender.trim().toUpperCase()))
      errors.push(`Invalid gender "${data.gender}"`);
    if (data.dateOfBirth && isNaN(Date.parse(data.dateOfBirth)))
      errors.push(`Invalid date of birth "${data.dateOfBirth}"`);
    if (data.guardianEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.guardianEmail.trim()))
      errors.push(`Invalid guardian email "${data.guardianEmail}"`);

    return { index, data, errors, resolved: errors.length === 0 ? resolved : undefined };
  });

  const valid = results.filter((r) => r.errors.length === 0).length;
  return {
    rows: results,
    summary: { total: results.length, valid, invalid: results.length - valid },
  };
}

function parseRows(formData: FormData): ImportRow[] {
  try {
    return JSON.parse(String(formData.get("rows") || "[]"));
  } catch {
    return [];
  }
}

export async function previewImport(
  _prev: ImportPreview,
  formData: FormData,
): Promise<ImportPreview> {
  const ctx = await requireUser();
  assertPermission(ctx, "data.import");
  return validate(ctx, parseRows(formData));
}

export interface CommitResult {
  done?: boolean;
  error?: string;
  created?: number;
  guardians?: number;
  skipped?: number;
}

export async function commitImport(
  _prev: CommitResult,
  formData: FormData,
): Promise<CommitResult> {
  const ctx = await requireUser();
  assertPermission(ctx, "data.import");
  const rows = parseRows(formData);
  const preview = await validate(ctx, rows);
  if (preview.error) return { error: preview.error };

  const valid = preview.rows.filter((r) => r.errors.length === 0 && r.resolved);
  if (valid.length === 0) return { error: "There are no valid rows to import." };

  // Per-campus authorization for the resolved rows.
  for (const r of valid) {
    if (!canForCampus(ctx, "data.import", r.resolved!.campusId))
      return { error: "You are not allowed to import into one of the campuses in this file." };
  }

  const limitError = await checkLimit(ctx.tenantId!, "students", valid.length);
  if (limitError) return { error: limitError };

  let created = 0;
  let guardians = 0;

  // All-or-nothing commit of the valid set (CFG-004: no partial commit).
  await prisma.$transaction(async (tx) => {
    for (const r of valid) {
      const d = r.data;
      const person = await tx.person.create({
        data: {
          tenantId: ctx.tenantId!,
          firstName: d.firstName!.trim(),
          lastName: d.lastName!.trim(),
          gender: (d.gender?.trim().toUpperCase() as Gender) ?? "UNDISCLOSED",
          dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
        },
      });
      const student = await tx.student.create({
        data: {
          tenantId: ctx.tenantId!,
          personId: person.id,
          admissionNumber: d.admissionNumber!.trim(),
          status: "ENROLLED",
        },
      });
      await tx.enrollment.create({
        data: {
          tenantId: ctx.tenantId!,
          studentId: student.id,
          campusId: r.resolved!.campusId,
          academicYearId: r.resolved!.academicYearId,
          gradeLevelId: r.resolved!.gradeLevelId,
          sectionId: r.resolved!.sectionId,
          status: "ACTIVE",
        },
      });
      if (d.guardianName?.trim()) {
        const [gf, ...gr] = d.guardianName.trim().split(" ");
        const gp = await tx.person.create({
          data: {
            tenantId: ctx.tenantId!,
            firstName: gf,
            lastName: gr.join(" ") || d.lastName!.trim(),
            email: d.guardianEmail?.trim() || null,
          },
        });
        const guardian = await tx.guardian.create({
          data: { tenantId: ctx.tenantId!, personId: gp.id },
        });
        await tx.guardianRelationship.create({
          data: {
            tenantId: ctx.tenantId!,
            guardianId: guardian.id,
            studentId: student.id,
            relationship: "GUARDIAN",
            isPrimaryContact: true,
            financiallyResponsible: true,
          },
        });
        guardians++;
      }
      created++;
    }
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "data.import.students",
    targetType: "Student",
    metadata: { created, guardians, invalid: preview.summary.invalid },
  });

  return { done: true, created, guardians, skipped: preview.summary.invalid };
}
