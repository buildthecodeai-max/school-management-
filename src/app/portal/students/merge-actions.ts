"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { can, requireUser } from "@/lib/rbac";
import { MergeError, mergeStudents } from "@/lib/student-merge";

export async function lookupDuplicate(formData: FormData) {
  const ctx = await requireUser();
  if (!ctx.tenantId || !can(ctx, "student.merge")) throw new Error("Merging students requires organization-wide rights.");
  const keepId = String(formData.get("keepId"));
  const admissionNumber = String(formData.get("admissionNumber") ?? "").trim();
  const dup = await prisma.student.findFirst({
    where: { tenantId: ctx.tenantId, admissionNumber },
    select: { id: true },
  });
  redirect(
    `/portal/students/${keepId}/merge?${dup ? `dup=${dup.id}` : `missing=${encodeURIComponent(admissionNumber)}`}`,
  );
}

export async function confirmMerge(formData: FormData) {
  const ctx = await requireUser();
  if (!ctx.tenantId || !can(ctx, "student.merge")) throw new Error("Merging students requires organization-wide rights.");
  const keepId = String(formData.get("keepId"));
  const dropId = String(formData.get("dropId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) redirect(`/portal/students/${keepId}/merge?dup=${dropId}&error=${encodeURIComponent("A reason is required.")}`);

  try {
    await mergeStudents(ctx.tenantId, keepId, dropId, ctx.user.id, reason);
  } catch (e) {
    if (e instanceof MergeError)
      redirect(`/portal/students/${keepId}/merge?dup=${dropId}&error=${encodeURIComponent(e.message)}`);
    throw e;
  }
  revalidatePath("/portal/students");
  redirect(`/portal/students/${keepId}?merged=1`);
}
