"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { clean, currentCampusOf } from "@/lib/restricted";

export interface SafeguardingActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// safeguarding.case.write is NOT in any default role — deliberately narrow.
export async function openSafeguardingCase(_p: SafeguardingActionState, f: FormData): Promise<SafeguardingActionState> {
  const ctx = await requireUser();
  const student = await prisma.student.findFirst({ where: { tenantId: ctx.tenantId!, admissionNumber: clean(f.get("admissionNumber"), 50) }, select: { id: true } });
  if (!student) return { error: "No student with that admission number." };
  const campusId = await currentCampusOf(ctx.tenantId!, student.id);
  if (!campusId) return { error: "This student is not enrolled on any campus." };
  if (!canForCampus(ctx, "safeguarding.case.write", campusId)) return { error: "You do not have permission to open safeguarding cases." };
  const title = clean(f.get("title"), 200);
  const concern = clean(f.get("concern"), 5000);
  if (title.length < 3) return { error: "Give the case a short title." };
  if (concern.length < 10) return { error: "Record the concern (at least 10 characters)." };

  const safeCase = await prisma.$transaction(async (tx) => {
    const c = await tx.safeguardingCase.create({ data: { tenantId: ctx.tenantId!, campusId, studentId: student.id, title, status: "OPEN" } });
    await tx.safeguardingNote.create({ data: { tenantId: ctx.tenantId!, caseId: c.id, authorUserId: ctx.user.id, body: concern } });
    return c;
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "safeguarding.case.opened", targetType: "SafeguardingCase", targetId: safeCase.id, campusId, scopeType: "CAMPUS", metadata: { studentId: student.id } });

  // Alert the other people who can read cases on this campus. The message names
  // no student and no detail; they must open the case, which is itself audited.
  const readers = await prisma.roleAssignment.findMany({
    where: { user: { tenantId: ctx.tenantId! }, role: { permissions: { has: "safeguarding.case.read" } }, OR: [{ scopeType: "ORG" }, { campusId }] },
    select: { userId: true },
  });
  for (const userId of new Set(readers.map((r) => r.userId))) {
    if (userId === ctx.user.id) continue;
    await notify({ tenantId: ctx.tenantId!, recipientUserId: userId, category: "ANNOUNCEMENT", title: "A new safeguarding case was opened", body: "Open the safeguarding area to review it.", dataClassification: "SENSITIVE", relatedType: "safeguarding", relatedId: safeCase.id, dedupeKey: `safeguarding:opened:${safeCase.id}:${userId}` });
  }
  revalidatePath("/portal/safeguarding");
  return { ok: true, message: "Case opened.", caseId: safeCase.id } as SafeguardingActionState;
}

async function caseFor(ctx: Awaited<ReturnType<typeof requireUser>>, caseId: string) {
  return prisma.safeguardingCase.findFirst({ where: { id: caseId, tenantId: ctx.tenantId! } });
}

// Notes are append-only: they are never edited or deleted.
export async function addSafeguardingNote(_p: SafeguardingActionState, f: FormData): Promise<SafeguardingActionState> {
  const ctx = await requireUser();
  const c = await caseFor(ctx, clean(f.get("caseId"), 40));
  if (!c) return { error: "Case not found." };
  if (!canForCampus(ctx, "safeguarding.case.write", c.campusId)) return { error: "Permission denied." };
  if (c.status === "CLOSED") return { error: "This case is closed. Reopen it to add notes." };
  const body = clean(f.get("body"), 5000);
  if (body.length < 3) return { error: "Write the note." };
  await prisma.safeguardingNote.create({ data: { tenantId: ctx.tenantId!, caseId: c.id, authorUserId: ctx.user.id, body } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "safeguarding.note.added", targetType: "SafeguardingCase", targetId: c.id, campusId: c.campusId, scopeType: "CAMPUS" });
  revalidatePath(`/portal/safeguarding/${c.id}`);
  return { ok: true, message: "Note added." };
}

const MOVES: Record<string, string[]> = { OPEN: ["UNDER_REVIEW", "CLOSED"], UNDER_REVIEW: ["OPEN", "CLOSED"], CLOSED: ["OPEN"] };

export async function setSafeguardingStatus(_p: SafeguardingActionState, f: FormData): Promise<SafeguardingActionState> {
  const ctx = await requireUser();
  const c = await caseFor(ctx, clean(f.get("caseId"), 40));
  if (!c) return { error: "Case not found." };
  if (!canForCampus(ctx, "safeguarding.case.write", c.campusId)) return { error: "Permission denied." };
  const to = clean(f.get("to"), 20);
  if (!(MOVES[c.status] ?? []).includes(to)) return { error: `A ${c.status.toLowerCase().replace("_", " ")} case cannot become ${to.toLowerCase().replace("_", " ")}.` };
  const reason = clean(f.get("reason"), 2000);
  // Closing or reopening is a decision that must be explained.
  if ((to === "CLOSED" || c.status === "CLOSED") && reason.length < 10) return { error: "Record the reason (at least 10 characters)." };

  const changed = await prisma.$transaction(async (tx) => {
    // Conditional on the status we read, so two people cannot both move the case.
    const moved = await tx.safeguardingCase.updateMany({ where: { id: c.id, status: c.status }, data: { status: to as never, closedAt: to === "CLOSED" ? new Date() : null } });
    if (moved.count === 0) return false;
    await tx.safeguardingNote.create({ data: { tenantId: ctx.tenantId!, caseId: c.id, authorUserId: ctx.user.id, body: `Status changed from ${c.status} to ${to}.${reason ? ` ${reason}` : ""}` } });
    return true;
  });
  if (!changed) return { error: "The case was changed by someone else. Refresh and try again." };

  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `safeguarding.case.${to === "CLOSED" ? "closed" : to === "OPEN" && c.status === "CLOSED" ? "reopened" : "status"}`, targetType: "SafeguardingCase", targetId: c.id, campusId: c.campusId, scopeType: "CAMPUS", metadata: { from: c.status, to } });
  revalidatePath(`/portal/safeguarding/${c.id}`);
  revalidatePath("/portal/safeguarding");
  return { ok: true, message: `Case is now ${to.toLowerCase().replace("_", " ")}.` };
}
