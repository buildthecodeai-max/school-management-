"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ApplicantStage, JobOpeningStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canForCampus, requireUser } from "@/lib/rbac";
import { toCents } from "@/lib/money";
import { stageMoveError } from "@/lib/recruitment";

export interface RecruitState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const STAGES = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"] as const;
const OPENING_STATUSES = ["OPEN", "ON_HOLD", "CLOSED", "FILLED"] as const;

async function recruiter(campusId: string, perm: "hr.recruit.write" | "hr.staff.write" = "hr.recruit.write") {
  const ctx = await requireUser();
  if (!ctx.tenantId || !canForCampus(ctx, perm, campusId)) return null;
  return ctx;
}

// A position id is client-supplied: confirm it belongs to this campus.
async function positionInCampus(tenantId: string, campusId: string, positionId: string) {
  return prisma.position.findFirst({
    where: { id: positionId, tenantId, department: { campusId } },
    select: { id: true },
  });
}

const openingSchema = z.object({
  campusId: z.string().min(1),
  title: z.string().trim().min(2, "Give the opening a title."),
  positionId: z.string().optional(),
  headcount: z.coerce.number().int().min(1).max(50),
  description: z.string().trim().max(4000).optional(),
  closesAt: z.string().optional(),
});

export async function createOpening(_prev: RecruitState, formData: FormData): Promise<RecruitState> {
  const parsed = openingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;
  const ctx = await recruiter(d.campusId);
  if (!ctx) return { error: "Permission denied." };

  const campus = await prisma.campus.findFirst({ where: { id: d.campusId, tenantId: ctx.tenantId! }, select: { id: true } });
  if (!campus) return { error: "Campus not found." };
  if (d.positionId && !(await positionInCampus(ctx.tenantId!, d.campusId, d.positionId)))
    return { error: "Choose a valid position." };

  const opening = await prisma.jobOpening.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId: d.campusId,
      positionId: d.positionId || null,
      title: d.title,
      description: d.description || null,
      headcount: d.headcount,
      closesAt: d.closesAt ? new Date(d.closesAt) : null,
      createdByUserId: ctx.user.id,
    },
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "hr.recruit.opening.created",
    targetType: "JobOpening",
    targetId: opening.id,
    campusId: d.campusId,
    metadata: { title: d.title, headcount: d.headcount },
  });
  revalidatePath("/portal/hr/recruitment");
  return { ok: true, message: `Opening “${d.title}” created.` };
}

export async function setOpeningStatus(_prev: RecruitState, formData: FormData): Promise<RecruitState> {
  const id = String(formData.get("openingId") ?? "");
  const status = String(formData.get("status") ?? "") as JobOpeningStatus;
  if (!OPENING_STATUSES.includes(status)) return { error: "Invalid status." };

  const ctxBase = await requireUser();
  const opening = ctxBase.tenantId
    ? await prisma.jobOpening.findFirst({ where: { id, tenantId: ctxBase.tenantId } })
    : null;
  if (!opening) return { error: "Opening not found." };
  const ctx = await recruiter(opening.campusId);
  if (!ctx) return { error: "Permission denied." };

  await prisma.jobOpening.update({ where: { id }, data: { status } });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "hr.recruit.opening.status",
    targetType: "JobOpening",
    targetId: id,
    campusId: opening.campusId,
    metadata: { from: opening.status, to: status },
  });
  revalidatePath("/portal/hr/recruitment");
  revalidatePath(`/portal/hr/recruitment/${id}`);
  return { ok: true, message: `Opening marked ${status.replace("_", " ").toLowerCase()}.` };
}

const applicantSchema = z.object({
  openingId: z.string().min(1),
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  phone: z.string().trim().max(40).optional(),
  source: z.string().trim().max(80).optional(),
  coverNote: z.string().trim().max(4000).optional(),
});

export async function addApplicant(_prev: RecruitState, formData: FormData): Promise<RecruitState> {
  const parsed = applicantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;

  const ctxBase = await requireUser();
  const opening = ctxBase.tenantId
    ? await prisma.jobOpening.findFirst({ where: { id: d.openingId, tenantId: ctxBase.tenantId } })
    : null;
  if (!opening) return { error: "Opening not found." };
  const ctx = await recruiter(opening.campusId);
  if (!ctx) return { error: "Permission denied." };
  if (opening.status !== "OPEN") return { error: "This opening is not accepting applicants." };

  try {
    const applicant = await prisma.jobApplicant.create({
      data: {
        tenantId: ctx.tenantId!,
        openingId: opening.id,
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email,
        phone: d.phone || null,
        source: d.source || null,
        coverNote: d.coverNote || null,
        events: { create: { tenantId: ctx.tenantId!, toStage: "APPLIED", actorUserId: ctx.user.id, note: "Application recorded" } },
      },
    });
    await audit({
      tenantId: ctx.tenantId,
      actorUserId: ctx.user.id,
      action: "hr.recruit.applicant.added",
      targetType: "JobApplicant",
      targetId: applicant.id,
      campusId: opening.campusId,
      metadata: { openingId: opening.id },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "This person has already applied to this opening." };
    throw e;
  }
  revalidatePath(`/portal/hr/recruitment/${opening.id}`);
  revalidatePath("/portal/hr/recruitment");
  return { ok: true, message: `${d.firstName} ${d.lastName} added.` };
}

async function loadApplicant(applicantId: string) {
  const ctxBase = await requireUser();
  if (!ctxBase.tenantId) return null;
  const applicant = await prisma.jobApplicant.findFirst({
    where: { id: applicantId, tenantId: ctxBase.tenantId },
    include: { opening: true },
  });
  return applicant;
}

export async function moveApplicant(_prev: RecruitState, formData: FormData): Promise<RecruitState> {
  const toStage = String(formData.get("toStage") ?? "") as ApplicantStage;
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!STAGES.includes(toStage as (typeof STAGES)[number])) return { error: "Choose a stage." };

  const applicant = await loadApplicant(String(formData.get("applicantId") ?? ""));
  if (!applicant) return { error: "Applicant not found." };
  const ctx = await recruiter(applicant.opening.campusId);
  if (!ctx) return { error: "Permission denied." };

  const problem = stageMoveError(applicant.stage, toStage);
  if (problem) return { error: problem };

  await prisma.$transaction([
    prisma.jobApplicant.update({ where: { id: applicant.id }, data: { stage: toStage } }),
    prisma.jobApplicantEvent.create({
      data: {
        tenantId: ctx.tenantId!,
        applicantId: applicant.id,
        fromStage: applicant.stage,
        toStage,
        note: note || null,
        actorUserId: ctx.user.id,
      },
    }),
  ]);
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "hr.recruit.applicant.moved",
    targetType: "JobApplicant",
    targetId: applicant.id,
    campusId: applicant.opening.campusId,
    metadata: { from: applicant.stage, to: toStage },
  });
  revalidatePath(`/portal/hr/recruitment/${applicant.openingId}`);
  revalidatePath("/portal/hr/recruitment");
  return { ok: true, message: `Moved to ${toStage.toLowerCase()}.` };
}

export async function rateApplicant(_prev: RecruitState, formData: FormData): Promise<RecruitState> {
  const rating = Number(formData.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: "Rating must be 1 to 5." };
  const applicant = await loadApplicant(String(formData.get("applicantId") ?? ""));
  if (!applicant) return { error: "Applicant not found." };
  if (!(await recruiter(applicant.opening.campusId))) return { error: "Permission denied." };
  await prisma.jobApplicant.update({ where: { id: applicant.id }, data: { rating } });
  revalidatePath(`/portal/hr/recruitment/${applicant.openingId}`);
  return { ok: true };
}

const hireSchema = z.object({
  applicantId: z.string().min(1),
  employeeNumber: z.string().trim().min(1, "Employee number is required."),
  positionId: z.string().min(1, "Choose a position."),
  contractType: z.enum(["PERMANENT", "TEMPORARY", "PART_TIME", "CONTRACT"]),
  salary: z.string().optional(),
  startDate: z.string().min(1, "Start date is required."),
});

export async function hireApplicant(_prev: RecruitState, formData: FormData): Promise<RecruitState> {
  const parsed = hireSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const d = parsed.data;

  const applicant = await loadApplicant(d.applicantId);
  if (!applicant) return { error: "Applicant not found." };
  const campusId = applicant.opening.campusId;
  // Hiring creates a staff record, so it needs both recruitment and HR rights.
  const ctx = await recruiter(campusId);
  if (!ctx || !(await recruiter(campusId, "hr.staff.write"))) return { error: "Permission denied." };
  const tenantId = ctx.tenantId!;

  if (applicant.stage !== "OFFER") return { error: "Move the applicant to the Offer stage before hiring." };
  if (!(await positionInCampus(tenantId, campusId, d.positionId))) return { error: "Choose a valid position." };

  const [numberTaken, alreadyStaff] = await Promise.all([
    prisma.staff.findFirst({ where: { tenantId, employeeNumber: d.employeeNumber }, select: { id: true } }),
    prisma.staff.findFirst({ where: { tenantId, person: { email: applicant.email } }, select: { id: true } }),
  ]);
  if (numberTaken) return { error: `Employee number "${d.employeeNumber}" already exists.` };
  if (alreadyStaff) return { error: "A staff member with this email already exists." };

  const salary = d.salary ? toCents(d.salary) : 0;
  if (salary < 0) return { error: "Salary cannot be negative." };

  const staffId = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        tenantId,
        firstName: applicant.firstName,
        lastName: applicant.lastName,
        email: applicant.email,
        phone: applicant.phone,
      },
    });
    const staff = await tx.staff.create({
      data: { tenantId, personId: person.id, employeeNumber: d.employeeNumber, title: "" },
    });
    await tx.employmentRecord.create({
      data: {
        tenantId,
        campusId,
        staffId: staff.id,
        positionId: d.positionId,
        startDate: new Date(d.startDate),
        contractType: d.contractType,
        salary,
      },
    });
    await tx.jobApplicant.update({ where: { id: applicant.id }, data: { stage: "HIRED", staffId: staff.id } });
    await tx.jobApplicantEvent.create({
      data: {
        tenantId,
        applicantId: applicant.id,
        fromStage: "OFFER",
        toStage: "HIRED",
        note: `Hired as ${d.employeeNumber}`,
        actorUserId: ctx.user.id,
      },
    });
    const hired = await tx.jobApplicant.count({ where: { openingId: applicant.openingId, stage: "HIRED" } });
    if (hired >= applicant.opening.headcount && applicant.opening.status === "OPEN") {
      await tx.jobOpening.update({ where: { id: applicant.openingId }, data: { status: "FILLED" } });
    }
    return staff.id;
  });

  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "hr.staff.added",
    targetType: "Staff",
    targetId: staffId,
    campusId,
    metadata: { employeeNumber: d.employeeNumber, source: "recruitment", applicantId: applicant.id },
  });
  await audit({
    tenantId,
    actorUserId: ctx.user.id,
    action: "hr.recruit.hired",
    targetType: "JobApplicant",
    targetId: applicant.id,
    campusId,
    metadata: { openingId: applicant.openingId, staffId },
  });
  revalidatePath(`/portal/hr/recruitment/${applicant.openingId}`);
  revalidatePath("/portal/hr/recruitment");
  revalidatePath("/portal/hr");
  return { ok: true, message: `${applicant.firstName} ${applicant.lastName} hired as ${d.employeeNumber}.` };
}
