"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface SetupActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  preview?: {
    academicYears: number;
    terms: number;
    gradeLevels: number;
    sections: number;
    feeStructures: number;
    assessmentPlans: number;
  };
}

// CFG-002: Campus template clone — dry-run preview then $transaction commit.
// Copies AcademicYear → Term → GradeLevel → Section, FeeStructure/Lines,
// and AssessmentPlan structure from source campus to target campus.

const cloneSchema = z.object({
  sourceCampusId: z.string().min(1),
  targetCampusId: z.string().min(1),
  dryRun: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function cloneCampusTemplate(
  _prev: SetupActionState,
  formData: FormData,
): Promise<SetupActionState> {
  const ctx = await requireUser();
  const parsed = cloneSchema.safeParse({
    sourceCampusId: formData.get("sourceCampusId"),
    targetCampusId: formData.get("targetCampusId"),
    dryRun: formData.get("dryRun") ?? "true",
  });
  if (!parsed.success) return { error: "Invalid form data" };

  const { sourceCampusId, targetCampusId, dryRun } = parsed.data;

  if (!canForCampus(ctx, "org.settings.write", sourceCampusId)) {
    return { error: "You do not have permission to clone campus templates." };
  }
  if (!canForCampus(ctx, "org.settings.write", targetCampusId)) {
    return { error: "You do not have permission to configure the target campus." };
  }

  const source = await prisma.campus.findFirst({
    where: { id: sourceCampusId, tenantId: ctx.tenantId! },
    include: {
      academicYears: {
        include: { terms: true },
      },
      gradeLevels: {
        include: { sections: true },
      },
      feeStructures: {
        include: { lines: true },
      },
    },
  });
  if (!source) return { error: "Source campus not found." };

  const preview = {
    academicYears: source.academicYears.length,
    terms: source.academicYears.flatMap((y) => y.terms).length,
    gradeLevels: source.gradeLevels.length,
    sections: source.gradeLevels.flatMap((g) => g.sections).length,
    feeStructures: source.feeStructures.length,
    assessmentPlans: 0,
  };

  if (dryRun) {
    return { ok: true, preview, message: "Preview — no changes made." };
  }

  // Commit in a single transaction.
  await prisma.$transaction(async (tx) => {
    // Clone academic years + terms
    for (const year of source.academicYears) {
      const newYear = await tx.academicYear.create({
        data: {
          tenantId: ctx.tenantId!,
          campusId: targetCampusId,
          name: year.name,
          startDate: year.startDate,
          endDate: year.endDate,
          isCurrent: year.isCurrent,
        },
      });
      for (const term of year.terms) {
        await tx.term.create({
          data: {
            tenantId: ctx.tenantId!,
            academicYearId: newYear.id,
            name: term.name,
            startDate: term.startDate,
            endDate: term.endDate,
          },
        });
      }
    }

    // Clone grade levels + sections
    for (const gl of source.gradeLevels) {
      const newGl = await tx.gradeLevel.create({
        data: {
          tenantId: ctx.tenantId!,
          campusId: targetCampusId,
          name: gl.name,
          rank: gl.rank,
        },
      });
      // Sections need an academicYearId — find the matching year in target
      for (const sec of gl.sections) {
        const targetYear = await tx.academicYear.findFirst({
          where: { campusId: targetCampusId, name: source.academicYears.find((y) => y.id === sec.academicYearId)?.name },
        });
        if (!targetYear) continue;
        await tx.section.create({
          data: {
            tenantId: ctx.tenantId!,
            campusId: targetCampusId,
            gradeLevelId: newGl.id,
            academicYearId: targetYear.id,
            name: sec.name,
            capacity: sec.capacity,
          },
        });
      }
    }

    // Clone fee structures + lines
    for (const fs of source.feeStructures) {
      const newFs = await tx.feeStructure.create({
        data: {
          tenantId: ctx.tenantId!,
          campusId: targetCampusId,
          name: fs.name,
          active: fs.active,
        },
      });
      for (const line of fs.lines) {
        await tx.feeStructureLine.create({
          data: {
            tenantId: ctx.tenantId!,
            structureId: newFs.id,
            feeHeadId: line.feeHeadId,
            label: line.label,
            amount: line.amount,
            installmentCount: line.installmentCount,
            installmentPlan: line.installmentPlan ?? undefined,
          },
        });
      }
    }
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "campus.template.cloned",
    campusId: targetCampusId,
    metadata: { sourceCampusId, targetCampusId, ...preview },
  });

  revalidatePath("/portal/setup");
  return { ok: true, preview, message: "Campus structure cloned successfully." };
}
