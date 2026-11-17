"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface InventoryActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// INV-po: Create a purchase order with lines.
const poSchema = z.object({
  campusId: z.string().min(1),
  supplierId: z.string().min(1),
  notes: z.string().optional(),
  lines: z.string().min(1), // JSON: [{itemId, qty, unitCostCents}]
});

export async function createPurchaseOrder(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const parsed = poSchema.safeParse({
    campusId: formData.get("campusId"),
    supplierId: formData.get("supplierId"),
    notes: formData.get("notes") || undefined,
    lines: formData.get("lines"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, supplierId, notes, lines } = parsed.data;
  if (!canForCampus(ctx, "inventory.po.manage", campusId)) return { error: "Permission denied." };

  let parsedLines: { itemId: string; qty: number; unitCostCents: number }[];
  try {
    parsedLines = JSON.parse(lines);
  } catch {
    return { error: "Invalid lines format." };
  }
  if (parsedLines.length === 0) return { error: "At least one line required." };

  const po = await prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.create({
      data: {
        tenantId: ctx.tenantId!,
        campusId,
        supplierId,
        status: "DRAFT",
      },
    });
    await tx.purchaseOrderLine.createMany({
      data: parsedLines.map((l) => ({
        tenantId: ctx.tenantId!,
        poId: order.id,
        itemId: l.itemId,
        qty: l.qty,
        unitCost: l.unitCostCents,
      })),
    });
    return order;
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "inventory.po.created",
    targetType: "PurchaseOrder",
    targetId: po.id,
    campusId,
    metadata: { supplierId, lineCount: parsedLines.length },
  });

  revalidatePath("/portal/inventory");
  return { ok: true, message: "Purchase order created." };
}

// INV-po: Receive a PO — create stock ledger entries for each line.
const receiveSchema = z.object({
  poId: z.string().min(1),
  campusId: z.string().min(1),
});

export async function receivePurchaseOrder(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const parsed = receiveSchema.safeParse({
    poId: formData.get("poId"),
    campusId: formData.get("campusId"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { poId, campusId } = parsed.data;
  if (!canForCampus(ctx, "inventory.po.manage", campusId)) return { error: "Permission denied." };

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, tenantId: ctx.tenantId!, campusId },
    include: { lines: true },
  });
  if (!po) return { error: "Purchase order not found." };
  if (po.status === "RECEIVED") return { error: "Already received." };

  await prisma.$transaction(async (tx) => {
    await tx.stockLedgerEntry.createMany({
      data: po.lines.map((l) => ({
        tenantId: ctx.tenantId!,
        itemId: l.itemId,
        qty: l.qty,
        reason: "PO_RECEIVE",
        reference: po.id,
      })),
    });
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { status: "RECEIVED" },
    });
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "inventory.po.received",
    targetType: "PurchaseOrder",
    targetId: po.id,
    campusId,
    metadata: {},
  });

  revalidatePath("/portal/inventory");
  return { ok: true, message: "Purchase order received and stock updated." };
}

// INV-asset: Assign an inventory item to a person (staff/student).
const assetSchema = z.object({
  campusId: z.string().min(1),
  itemId: z.string().min(1),
  assignedToUserId: z.string().min(1),
  assignedAt: z.string().optional(),
  notes: z.string().optional(),
});

export async function assignAsset(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const parsed = assetSchema.safeParse({
    campusId: formData.get("campusId"),
    itemId: formData.get("itemId"),
    assignedToUserId: formData.get("assignedToUserId"),
    assignedAt: formData.get("assignedAt") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, itemId, assignedToUserId, assignedAt, notes } = parsed.data;
  if (!canForCampus(ctx, "inventory.asset.manage", campusId)) return { error: "Permission denied." };

  const assignment = await prisma.assetAssignment.create({
    data: {
      tenantId: ctx.tenantId!,
      itemId,
      assignedToUserId,
      assignedAt: assignedAt ? new Date(assignedAt) : new Date(),
      notes: notes || null,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "inventory.asset.assigned",
    targetType: "AssetAssignment",
    targetId: assignment.id,
    campusId,
    metadata: { itemId, assignedToUserId },
  });

  revalidatePath("/portal/inventory");
  return { ok: true, message: "Asset assigned." };
}

// INV-asset: Return/unassign an asset.
export async function returnAsset(
  _prev: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const assignmentId = formData.get("assignmentId") as string;
  const campusId = formData.get("campusId") as string;
  if (!assignmentId || !campusId) return { error: "Missing required fields." };
  if (!canForCampus(ctx, "inventory.asset.manage", campusId)) return { error: "Permission denied." };

  await prisma.assetAssignment.update({
    where: { id: assignmentId },
    data: { returnedAt: new Date() },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "inventory.asset.returned",
    targetType: "AssetAssignment",
    targetId: assignmentId,
    campusId,
    metadata: {},
  });

  revalidatePath("/portal/inventory");
  return { ok: true, message: "Asset returned." };
}
