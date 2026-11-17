"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface CertActionState {
  ok?: boolean;
  error?: string;
}

export async function issueCertificate(form: FormData) {
  const ctx = await requireUser();
  const studentId = String(form.get("studentId") ?? "");
  const campusId = String(form.get("campusId") ?? "");
  const type = String(form.get("type") ?? "BONAFIDE");
  if (!ctx.tenantId || !canForCampus(ctx, "student.write", campusId))
    throw new Error("Permission denied");
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: ctx.tenantId } });
  if (!student) throw new Error("Student not found");
  const number = `CERT-${Date.now().toString(36).toUpperCase()}`;
  const row = await prisma.certificateIssue.create({
    data: { tenantId: ctx.tenantId, campusId, studentId, certificateType: type, number, issuedByUserId: ctx.user.id, payload: {} },
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "certificate.issued", targetType: "CertificateIssue", targetId: row.id, campusId });
  revalidatePath("/portal/certificates");
}

export async function issueIdCard(form: FormData) {
  const ctx = await requireUser();
  const studentId = String(form.get("studentId") ?? "");
  const yearId = String(form.get("academicYearId") ?? "");
  if (!ctx.tenantId || !ctx.hasOrgScope) throw new Error("Permission denied");
  const student = await prisma.student.findFirst({ where: { id: studentId, tenantId: ctx.tenantId } });
  const year = await prisma.academicYear.findFirst({ where: { id: yearId, tenantId: ctx.tenantId } });
  if (!student || !year) throw new Error("Student or academic year not found");
  const card = await prisma.studentIdCard.upsert({
    where: { studentId_academicYearId: { studentId, academicYearId: yearId } },
    update: { active: true, issuedAt: new Date(), issuedByUserId: ctx.user.id },
    create: { tenantId: ctx.tenantId, studentId, academicYearId: yearId, cardNumber: `ID-${Date.now().toString(36).toUpperCase()}`, issuedByUserId: ctx.user.id },
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "student.id_card.issued", targetType: "StudentIdCard", targetId: card.id, campusId: year.campusId });
  revalidatePath("/portal/certificates");
}

export async function deleteCertificate(
  _prev: CertActionState,
  formData: FormData,
): Promise<CertActionState> {
  const ctx = await requireUser();
  const id = String(formData.get("id") ?? "");
  const issue = await prisma.certificateIssue.findFirst({
    where: { id, tenantId: ctx.tenantId! },
  });
  if (!issue) return { error: "Certificate not found." };
  if (!canForCampus(ctx, "student.write", issue.campusId))
    return { error: "Permission denied." };
  await prisma.certificateIssue.delete({ where: { id } });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "certificate.deleted",
    targetType: "CertificateIssue",
    targetId: id,
    campusId: issue.campusId,
    metadata: { number: issue.number, type: issue.certificateType },
  });
  revalidatePath("/portal/certificates");
  return { ok: true };
}

export async function editCertificate(
  _prev: CertActionState,
  formData: FormData,
): Promise<CertActionState> {
  const ctx = await requireUser();
  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("type") ?? "");
  if (!["BONAFIDE", "TRANSFER", "CHARACTER"].includes(type))
    return { error: "Invalid certificate type." };
  const issue = await prisma.certificateIssue.findFirst({
    where: { id, tenantId: ctx.tenantId! },
  });
  if (!issue) return { error: "Certificate not found." };
  if (!canForCampus(ctx, "student.write", issue.campusId))
    return { error: "Permission denied." };
  await prisma.certificateIssue.update({
    where: { id },
    data: { certificateType: type },
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "certificate.updated",
    targetType: "CertificateIssue",
    targetId: id,
    campusId: issue.campusId,
    metadata: { number: issue.number, newType: type },
  });
  revalidatePath("/portal/certificates");
  return { ok: true };
}
