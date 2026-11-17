"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

// NOTE: this is a PUBLIC, unauthenticated endpoint. In production it must be
// protected by CAPTCHA / bot detection and rate limiting (see NFR abuse tests).
// It only ever creates an INQUIRY-stage lead; it never reads or exposes data.

const schema = z.object({
  slug: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  campusId: z.string().min(1),
  gradeLevelId: z.string().optional(),
  guardianName: z.string().min(1),
  guardianEmail: z.string().email(),
  guardianPhone: z.string().optional(),
  consent: z.string().optional(),
});

export interface InquiryState {
  ok?: boolean;
  error?: string;
}

export async function submitInquiry(
  _prev: InquiryState,
  formData: FormData,
): Promise<InquiryState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const d = parsed.data;
  if (!d.consent) return { error: "Guardian consent is required to submit." };

  const tenant = await prisma.tenant.findUnique({ where: { slug: d.slug } });
  if (!tenant || tenant.status === "CLOSED") {
    return { error: "This school is not accepting inquiries." };
  }

  // Validate the campus belongs to the tenant (never trust the client).
  const campus = await prisma.campus.findFirst({
    where: { id: d.campusId, tenantId: tenant.id, status: "ACTIVE" },
  });
  if (!campus) return { error: "Please choose a valid campus." };

  // The grade level is equally client-supplied: the FK only proves it exists,
  // not that it belongs to this campus, so verify it the same way.
  if (d.gradeLevelId) {
    const gradeLevel = await prisma.gradeLevel.findFirst({
      where: { id: d.gradeLevelId, tenantId: tenant.id, campusId: campus.id },
      select: { id: true },
    });
    if (!gradeLevel) return { error: "Please choose a valid grade level." };
  }

  const person = await prisma.person.create({
    data: {
      tenantId: tenant.id,
      firstName: d.firstName,
      lastName: d.lastName,
      dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
    },
  });

  const app = await prisma.application.create({
    data: {
      tenantId: tenant.id,
      campusId: campus.id,
      applicantPersonId: person.id,
      gradeLevelId: d.gradeLevelId || null,
      source: "WEBSITE",
      stage: "INQUIRY",
      consentGiven: true,
      guardianName: d.guardianName,
      guardianEmail: d.guardianEmail,
      guardianPhone: d.guardianPhone || null,
      stageEvents: {
        create: { tenantId: tenant.id, toStage: "INQUIRY", reason: "Public inquiry form" },
      },
    },
  });

  await audit({
    tenantId: tenant.id,
    action: "admissions.inquiry.public",
    targetType: "Application",
    targetId: app.id,
    campusId: campus.id,
    metadata: { source: "WEBSITE" },
  });

  return { ok: true };
}
