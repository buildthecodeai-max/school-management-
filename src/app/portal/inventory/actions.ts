"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { requestApproval } from "@/lib/approvals";

export interface InventoryActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// Submit a requisition (requires approval via IAM-003 ApprovalRequest).
const requisitionSchema = z.object({
  campusId: z.string().min(1),
  notes: z.string().optional(),
  lines: z.string().min(1), // JSON [{itemId, qty}]
});

export async function submitRequisition(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const parsed = requisitionSchema.safeParse({
    campusId: formData.get("campusId"),
    notes: formData.get("notes"),
    lines: formData.get("lines"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { campusId, notes, lines } = parsed.data;
  if (!canForCampus(ctx, "inventory.requisition.request", campusId)) return { error: "Permission denied." };

  let parsedLines: { itemId: string; qty: number }[];
  try {
    parsedLines = JSON.parse(lines);
  } catch {
    return { error: "Invalid lines format." };
  }

  const req = await prisma.$transaction(async (tx) => {
    const requisition = await tx.requisition.create({
      data: {
        tenantId: ctx.tenantId!,
        campusId,
        requestedByUserId: ctx.user.id,
        status: "SUBMITTED",
        notes,
        lines: {
          create: parsedLines.map((l) => ({
            tenantId: ctx.tenantId!,
            itemId: l.itemId,
            qty: l.qty,
          })),
        },
      },
    });
    return requisition;
  });

  // IAM-003: Wire requisition approval.
  await requestApproval({
    tenantId: ctx.tenantId!,
    campusId,
    requestType: "inventory.requisition",
    referenceType: "Requisition",
    referenceId: req.id,
    requestedByUserId: ctx.user.id,
    payload: { campusId, notes, lines: parsedLines },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "inventory.requisition.submitted",
    targetType: "Requisition",
    targetId: req.id,
    campusId,
    metadata: { lineCount: parsedLines.length },
  });

  revalidatePath("/portal/inventory");
  return { ok: true, message: "Requisition submitted for approval." };
}

// Adjust stock directly (admin-only).
const adjustSchema = z.object({
  campusId: z.string().min(1),
  itemId: z.string().min(1),
  qty: z.coerce.number().int(),
  reason: z.string().min(1),
});

export async function adjustStock(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const parsed = adjustSchema.safeParse({
    campusId: formData.get("campusId"),
    itemId: formData.get("itemId"),
    qty: formData.get("qty"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Invalid form data" };
  const { campusId, itemId, qty, reason } = parsed.data;
  if (!canForCampus(ctx, "inventory.write", campusId)) return { error: "Permission denied." };

  const entry = await prisma.stockLedgerEntry.create({
    data: {
      tenantId: ctx.tenantId!,
      itemId,
      qty,
      reason: "ADJUSTMENT",
      reference: reason,
    },
  });

  // Check if below reorder threshold after adjustment.
  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, tenantId: ctx.tenantId! },
  });
  if (item && item.reorderThreshold > 0) {
    const total = await prisma.stockLedgerEntry.aggregate({
      where: { tenantId: ctx.tenantId!, itemId },
      _sum: { qty: true },
    });
    const currentStock = total._sum.qty ?? 0;
    if (currentStock <= item.reorderThreshold) {
      // Notify users with inventory.write on this campus.
      const campusAdmins = await prisma.roleAssignment.findMany({
        where: { campusId },
        include: { user: true },
        take: 3,
      });
      for (const ra of campusAdmins) {
        if (!ra.userId) continue;
        await notify({
          tenantId: ctx.tenantId!,
          recipientUserId: ra.userId,
          category: "ANNOUNCEMENT",
          title: `Low stock: ${item.name}`,
          body: `${item.name} is at or below reorder threshold (${currentStock} ${item.unit} remaining).`,
          dedupeKey: `inventory:lowstock:${itemId}:${new Date().toISOString().slice(0, 10)}`,
        });
      }
    }
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "inventory.stock.adjusted",
    targetType: "StockLedgerEntry",
    targetId: entry.id,
    campusId,
    metadata: { itemId, qty, reason },
  });

  revalidatePath("/portal/inventory");
  return { ok: true, message: "Stock adjusted." };
}
