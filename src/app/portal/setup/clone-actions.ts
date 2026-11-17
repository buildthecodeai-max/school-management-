"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface CloneState {
  ok?: boolean;
  error?: string;
  message?: string;
  preview?: ClonePreview;
}

export interface ClonePreview {
  academicYears: number;
  terms: number;
  gradeLevels: number;
  sections: number;
  feeStructures: number;
  feeStructureLines: number;
  assessmentPlans: number;
  gradeScales: number;
}

const cloneSchema = z.object({
  sourceCampusId: z.string().min(1),
  targetCampusId: z.string().min(1),
  preview: z.coerce.boolean().default(true),
  cloneAcademicStructure: z.coerce.boolean().default(true),
  cloneFeeStructures: z.coerce.boolean().default(true),
  cloneAssessmentPlans: z.coerce.boolean().default(true),
  cloneGradeScales: z.coerce.boolean().default(true),
});

// CFG-002: Clone campus configuration from a source campus to a target campus.
// Two modes: preview=true returns counts; preview=false commits in $transaction.
export async function cloneCampusConfig(
  _prev: CloneState,
  formData: FormData,
): Promise<CloneState> {
  const ctx = await requireUser();
  const parsed = cloneSchema.safeParse({
    sourceCampusId: formData.get("sourceCampusId"),
    targetCampusId: formData.get("targetCampusId"),
    preview: formData.get("preview"),
    cloneAcademicStructure: formData.get("cloneAcademicStructure"),
    cloneFeeStructures: formData.get("cloneFeeStructures"),
    cloneAssessmentPlans: formData.get("cloneAssessmentPlans"),
    cloneGradeScales: formData.get("cloneGradeScales"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { sourceCampusId, targetCampusId, preview, cloneAcademicStructure, cloneFeeStructures, cloneAssessmentPlans, cloneGradeScales } = parsed.data;

  if (sourceCampusId === targetCampusId) return { error: "Source and target campus must be different." };
  if (!canForCampus(ctx, "campus.write", sourceCampusId)) return { error: "Permission denied on source campus." };
  if (!canForCampus(ctx, "campus.write", targetCampusId)) return { error: "Permission denied on target campus." };

  const tenantId = ctx.tenantId!;

  // Load source data.
  const [sourceAcademicYears, sourceFeeStructures, sourceGradeScales] = await Promise.all([
    cloneAcademicStructure
      ? prisma.academicYear.findMany({
          where: { tenantId, campusId: sourceCampusId },
          include: {
            terms: true,
          },
        })
      : Promise.resolve([]),
    cloneFeeStructures
      ? prisma.feeStructure.findMany({
          where: { tenantId, campusId: sourceCampusId },
          include: { lines: true },
        })
      : Promise.resolve([]),
    cloneGradeScales
      ? prisma.gradeScale.findMany({
          where: { tenantId },
          include: { bands: true },
        })
      : Promise.resolve([]),
  ]);

  const sourceGradeLevels = cloneAcademicStructure
    ? await prisma.gradeLevel.findMany({ where: { tenantId, campusId: sourceCampusId }, orderBy: { rank: "asc" } })
    : [];

  const sourceSections = cloneAcademicStructure
    ? await prisma.section.findMany({ where: { tenantId, campusId: sourceCampusId } })
    : [];

  const sourceAssessmentPlans = cloneAssessmentPlans
    ? await prisma.assessmentPlan.findMany({
        where: { tenantId, campusId: sourceCampusId },
        include: { components: true },
      })
    : [];

  const previewCounts: ClonePreview = {
    academicYears: sourceAcademicYears.length,
    terms: sourceAcademicYears.reduce((s, y) => s + y.terms.length, 0),
    gradeLevels: sourceGradeLevels.length,
    sections: sourceSections.length,
    feeStructures: sourceFeeStructures.length,
    feeStructureLines: sourceFeeStructures.reduce((s, fs) => s + fs.lines.length, 0),
    assessmentPlans: sourceAssessmentPlans.length,
    gradeScales: sourceGradeScales.length,
  };

  if (preview) {
    return { ok: true, preview: previewCounts, message: "Preview ready. Review before committing." };
  }

  // Commit in a single transaction.
  await prisma.$transaction(async (tx) => {
    // Grade Scales (tenant-level, deduplicate by name).
    if (cloneGradeScales) {
      for (const gs of sourceGradeScales) {
        const existing = await tx.gradeScale.findFirst({ where: { tenantId, name: gs.name } });
        if (!existing) {
          const newScale = await tx.gradeScale.create({ data: { tenantId, name: gs.name } });
          await tx.gradeBand.createMany({
            data: gs.bands.map((b) => ({
              tenantId,
              scaleId: newScale.id,
              grade: b.grade,
              minPercent: b.minPercent,
              gradePoint: b.gradePoint,
              isPass: b.isPass,
            })),
          });
        }
      }
    }

    // Grade levels → Sections → Academic years → Terms.
    const gradeLevelIdMap = new Map<string, string>(); // old → new
    const academicYearIdMap = new Map<string, string>();
    const termIdMap = new Map<string, string>();
    const sectionIdMap = new Map<string, string>();

    if (cloneAcademicStructure) {
      for (const gl of sourceGradeLevels) {
        const newGl = await tx.gradeLevel.create({
          data: { tenantId, campusId: targetCampusId, name: gl.name, rank: gl.rank },
        });
        gradeLevelIdMap.set(gl.id, newGl.id);
      }

      for (const ay of sourceAcademicYears) {
        const newAy = await tx.academicYear.create({
          data: {
            tenantId,
            campusId: targetCampusId,
            name: ay.name,
            startDate: ay.startDate,
            endDate: ay.endDate,
            isCurrent: false, // never mark cloned year as current
          },
        });
        academicYearIdMap.set(ay.id, newAy.id);

        for (const term of ay.terms) {
          const newTerm = await tx.term.create({
            data: {
              tenantId,
              academicYearId: newAy.id,
              name: term.name,
              startDate: term.startDate,
              endDate: term.endDate,
            },
          });
          termIdMap.set(term.id, newTerm.id);
        }
      }

      for (const sec of sourceSections) {
        const newGlId = gradeLevelIdMap.get(sec.gradeLevelId);
        const newAyId = academicYearIdMap.get(sec.academicYearId);
        if (!newGlId || !newAyId) continue;
        const newSec = await tx.section.create({
          data: {
            tenantId,
            campusId: targetCampusId,
            gradeLevelId: newGlId,
            academicYearId: newAyId,
            name: sec.name,
            capacity: sec.capacity,
          },
        });
        sectionIdMap.set(sec.id, newSec.id);
      }
    }

    // Fee structures.
    if (cloneFeeStructures) {
      for (const fs of sourceFeeStructures) {
        const newGlId = fs.gradeLevelId ? gradeLevelIdMap.get(fs.gradeLevelId) : undefined;
        const newAyId = fs.academicYearId ? academicYearIdMap.get(fs.academicYearId) : undefined;
        const newFs = await tx.feeStructure.create({
          data: {
            tenantId,
            campusId: targetCampusId,
            name: fs.name,
            gradeLevelId: newGlId ?? null,
            academicYearId: newAyId ?? null,
            active: false, // cloned structures start inactive; admin activates explicitly
            effectiveFrom: fs.effectiveFrom,
          },
        });
        await tx.feeStructureLine.createMany({
          data: fs.lines.map((l) => ({
            tenantId,
            structureId: newFs.id,
            feeHeadId: l.feeHeadId, // FeeHead is tenant-level; no remapping needed
            label: l.label,
            amount: l.amount,
            installmentCount: l.installmentCount,
            installmentPlan: l.installmentPlan ?? undefined,
          })),
        });
      }
    }

    // Assessment plans (structure only — no marks, no results).
    if (cloneAssessmentPlans) {
      for (const ap of sourceAssessmentPlans) {
        const newSecId = sectionIdMap.get(ap.sectionId);
        const newTermId = termIdMap.get(ap.termId);
        if (!newSecId || !newTermId) continue;
        const newAp = await tx.assessmentPlan.create({
          data: {
            tenantId,
            campusId: targetCampusId,
            sectionId: newSecId,
            termId: newTermId,
            name: ap.name,
            gradeScaleId: ap.gradeScaleId, // scale is tenant-level
            status: "OPEN",
          },
        });
        await tx.assessmentComponent.createMany({
          data: ap.components.map((c) => ({
            tenantId,
            planId: newAp.id,
            name: c.name,
            weight: c.weight,
            maxMarks: c.maxMarks,
          })),
        });
      }
    }
  });

  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "campus.config.cloned",
    targetType: "Campus",
    targetId: targetCampusId,
    campusId: targetCampusId,
    metadata: { sourceCampusId, ...previewCounts },
  });

  revalidatePath("/portal/setup");
  return {
    ok: true,
    message: `Campus configuration cloned: ${previewCounts.gradeLevels} grade levels, ${previewCounts.academicYears} academic year(s), ${previewCounts.feeStructures} fee structure(s), ${previewCounts.assessmentPlans} assessment plan(s).`,
  };
}
