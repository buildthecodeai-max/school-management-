"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { canForCampus, requireUser } from "@/lib/rbac";
import { APPROVAL_PERMISSION } from "@/lib/approval-types";

export interface ApprovalState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// IAM-003: maker-checker. A different person with the right permission decides;
// approving executes the underlying action in the same transaction.
export async function decideApproval(_p: ApprovalState, f: FormData): Promise<ApprovalState> {
  const ctx = await requireUser();
  const decision = String(f.get("decision")) === "APPROVED" ? "APPROVED" : "REJECTED";
  const note = String(f.get("note") ?? "").trim().slice(0, 500);
  const req = ctx.tenantId
    ? await prisma.approvalRequest.findFirst({ where: { id: String(f.get("id") ?? ""), tenantId: ctx.tenantId } })
    : null;
  if (!req) return { error: "Request not found." };
  if (req.status !== "PENDING") return { error: `This request is already ${req.status.toLowerCase()}.` };
  const perm = APPROVAL_PERMISSION[req.requestType];
  if (!perm || !req.campusId || !canForCampus(ctx, perm, req.campusId)) return { error: "You are not allowed to decide this request." };
  if (req.requestedByUserId === ctx.user.id) return { error: "You cannot approve your own request; another approver must decide it." };
  if (decision === "REJECTED" && !note) return { error: "Give a reason when rejecting." };

  const payload = req.payload as Record<string, unknown>;
  await prisma.$transaction(async (tx) => {
    if (decision === "APPROVED" && req.requestType === "fee.adjust") {
      const { studentId, amount, method, reason } = payload as { studentId: string; amount: number; method: string; reason: string };
      await tx.refund.create({ data: { tenantId: req.tenantId, studentId, amount, method: method as never, reason, approvedByUserId: ctx.user.id } });
    }
    if (req.requestType === "inventory.requisition" && req.referenceId) {
      await tx.requisition.updateMany({ where: { id: req.referenceId, tenantId: req.tenantId }, data: { status: decision } });
    }
    await tx.approvalRequest.update({ where: { id: req.id }, data: { status: decision, decisionNote: note || null, decidedAt: new Date() } });
  });

  await audit({
    tenantId: req.tenantId,
    actorUserId: ctx.user.id,
    action: decision === "APPROVED" ? "approval.approved" : "approval.rejected",
    targetType: "ApprovalRequest",
    targetId: req.id,
    campusId: req.campusId,
    scopeType: "CAMPUS",
    metadata: { requestType: req.requestType, note },
  });
  await notify({
    tenantId: req.tenantId,
    recipientUserId: req.requestedByUserId,
    category: "ANNOUNCEMENT",
    title: `Request ${decision === "APPROVED" ? "approved" : "rejected"}`,
    body: note || `Your ${req.requestType} request was ${decision.toLowerCase()}.`,
    relatedType: "ApprovalRequest",
    relatedId: req.id,
    dedupeKey: `approval:${req.id}:${decision}`,
  });
  revalidatePath("/portal/approvals");
  return { ok: true, message: decision === "APPROVED" ? "Approved and executed." : "Rejected." };
}
