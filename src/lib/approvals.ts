import "server-only";
import { prisma as db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export type RequestApprovalInput = {
  tenantId: string;
  campusId?: string;
  requestType: string; // e.g. "fee.adjust", "admissions.decide"
  referenceType?: string;
  referenceId?: string;
  requestedByUserId: string;
  assignedToUserId?: string;
  payload: Record<string, unknown>; // JSON-serialisable snapshot
  note?: string;
};

export async function requestApproval(input: RequestApprovalInput) {
  const req = await db.approvalRequest.create({
    data: {
      tenantId: input.tenantId,
      campusId: input.campusId,
      requestType: input.requestType,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      requestedByUserId: input.requestedByUserId,
      assignedToUserId: input.assignedToUserId,
      payload: input.payload as object,
      note: input.note,
      status: "PENDING",
    },
  });

  await audit({
    tenantId: input.tenantId,
    actorUserId: input.requestedByUserId,
    action: "approval.requested",
    targetType: "ApprovalRequest",
    targetId: req.id,
    campusId: input.campusId,
    metadata: { requestType: input.requestType },
  });

  if (input.assignedToUserId) {
    const user = await db.user.findUnique({
      where: { id: input.assignedToUserId },
      select: { id: true },
    });
    if (user) {
      await notify({
        tenantId: input.tenantId,
        recipientUserId: input.assignedToUserId,
        category: "ANNOUNCEMENT",
        title: "Approval request pending",
        body: `A new ${input.requestType} request requires your approval.`,
        relatedType: "ApprovalRequest",
        relatedId: req.id,
      });
    }
  }

  return req;
}

export type ResolveApprovalInput = {
  approvalRequestId: string;
  decidedByUserId: string;
  decision: "APPROVED" | "REJECTED";
  decisionNote?: string;
};

export async function resolveApproval(input: ResolveApprovalInput) {
  const req = await db.approvalRequest.findUniqueOrThrow({
    where: { id: input.approvalRequestId },
  });

  if (req.status !== "PENDING") {
    throw new Error(`Approval request is already ${req.status}`);
  }

  const updated = await db.approvalRequest.update({
    where: { id: input.approvalRequestId },
    data: {
      status: input.decision,
      decisionNote: input.decisionNote,
      decidedAt: new Date(),
    },
  });

  await audit({
    tenantId: req.tenantId,
    actorUserId: input.decidedByUserId,
    action: input.decision === "APPROVED" ? "approval.approved" : "approval.rejected",
    targetType: "ApprovalRequest",
    targetId: req.id,
    campusId: req.campusId ?? undefined,
    metadata: { requestType: req.requestType, note: input.decisionNote },
  });

  // Notify requester of the decision
  await notify({
    tenantId: req.tenantId,
    recipientUserId: req.requestedByUserId,
    category: "ANNOUNCEMENT",
    title: `Request ${input.decision === "APPROVED" ? "approved" : "rejected"}`,
    body:
      input.decisionNote ??
      `Your ${req.requestType} request has been ${input.decision.toLowerCase()}.`,
    relatedType: "ApprovalRequest",
    relatedId: req.id,
  });

  return updated;
}
