"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { MAX_QTY, canPoMove, parseCents } from "@/lib/inventory";

export interface InventoryActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const text = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);

// ---- purchase orders -------------------------------------------------------

export async function createPurchaseOrder(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId");
  if (!canForCampus(ctx, "inventory.po.manage", campusId)) return { error: "Permission denied." };
  const supplier = await prisma.supplier.findFirst({ where: { id: text(f, "supplierId"), tenantId: ctx.tenantId! }, select: { id: true } });
  if (!supplier) return { error: "Choose a supplier." };

  let raw: { itemId?: string; qty?: unknown; unitCost?: unknown }[];
  try { raw = JSON.parse(String(f.get("lines") ?? "[]")); if (!Array.isArray(raw) || raw.length === 0) throw new Error(); } catch { return { error: "Add at least one line." }; }
  const lines: { itemId: string; qty: number; unitCost: number }[] = [];
  for (const l of raw) {
    const qty = Number(l.qty);
    const unitCost = parseCents(l.unitCost);
    if (!l.itemId) return { error: "Every line needs an item." };
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { error: `Quantities must be whole numbers from 1 to ${MAX_QTY}.` };
    if (unitCost === null) return { error: "Unit costs must be amounts like 12.50." };
    lines.push({ itemId: l.itemId, qty, unitCost });
  }
  const ids = [...new Set(lines.map((l) => l.itemId))];
  if (ids.length !== lines.length) return { error: "An item appears on more than one line. Combine them." };
  const found = await prisma.inventoryItem.count({ where: { tenantId: ctx.tenantId!, campusId, id: { in: ids } } });
  if (found !== ids.length) return { error: "An item on the order does not exist on this campus." };
  const totalAmount = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

  const po = await prisma.purchaseOrder.create({
    data: { tenantId: ctx.tenantId!, campusId, supplierId: supplier.id, status: "DRAFT", totalAmount, lines: { create: lines.map((l) => ({ tenantId: ctx.tenantId!, ...l })) } },
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.po.created", targetType: "PurchaseOrder", targetId: po.id, campusId, metadata: { supplierId: supplier.id, lineCount: lines.length, totalAmount } });
  revalidatePath("/portal/inventory");
  return { ok: true, message: "Purchase order created." };
}

export async function setPurchaseOrderStatus(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const to = text(f, "to");
  const po = await prisma.purchaseOrder.findFirst({ where: { id: text(f, "poId"), tenantId: ctx.tenantId! }, include: { lines: true } });
  if (!po) return { error: "Purchase order not found." };
  if (!canForCampus(ctx, "inventory.po.manage", po.campusId)) return { error: "Permission denied." };
  if (!canPoMove(po.status, to)) return { error: `A ${po.status.toLowerCase()} order cannot become ${to.toLowerCase()}.` };

  const moved = await prisma.$transaction(async (tx) => {
    // Conditional update: only one caller can win, so stock is received exactly once.
    const claimed = await tx.purchaseOrder.updateMany({ where: { id: po.id, status: po.status }, data: { status: to as never, ...(to === "RECEIVED" ? { receivedAt: new Date() } : {}) } });
    if (claimed.count === 0) return false;
    if (to === "RECEIVED") {
      await tx.stockLedgerEntry.createMany({ data: po.lines.map((l) => ({ tenantId: ctx.tenantId!, itemId: l.itemId, qty: l.qty, reason: "PO_RECEIVE", reference: po.id })) });
    }
    return true;
  });
  if (!moved) return { error: "This order was already updated by someone else." };
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `inventory.po.${to.toLowerCase()}`, targetType: "PurchaseOrder", targetId: po.id, campusId: po.campusId, metadata: { from: po.status } });
  revalidatePath("/portal/inventory");
  return { ok: true, message: to === "RECEIVED" ? "Order received and stock updated." : `Order marked ${to.toLowerCase()}.` };
}

// ---- assets ---------------------------------------------------------------

export async function assignAsset(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const item = await prisma.inventoryItem.findFirst({ where: { id: text(f, "itemId"), tenantId: ctx.tenantId! } });
  if (!item) return { error: "Item not found." };
  if (!canForCampus(ctx, "inventory.asset.manage", item.campusId)) return { error: "Permission denied." };
  const user = await prisma.user.findFirst({ where: { id: text(f, "assignedToUserId"), tenantId: ctx.tenantId! }, select: { id: true } });
  if (!user) return { error: "Choose a person from this school." };
  const held = await prisma.assetAssignment.count({ where: { tenantId: ctx.tenantId!, itemId: item.id, returnedAt: null } });
  const stockAgg = await prisma.stockLedgerEntry.aggregate({ where: { tenantId: ctx.tenantId!, itemId: item.id }, _sum: { qty: true } });
  const onHand = stockAgg._sum.qty ?? 0;
  // Assigned units are still owned stock, so an item can only be handed out while units remain unassigned.
  if (held >= onHand) return { error: `All ${onHand} ${item.unit} of ${item.name} are already assigned.` };
  const a = await prisma.assetAssignment.create({ data: { tenantId: ctx.tenantId!, itemId: item.id, assignedToUserId: user.id, notes: text(f, "notes", 200) || null } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.asset.assigned", targetType: "AssetAssignment", targetId: a.id, campusId: item.campusId, metadata: { itemId: item.id, assignedToUserId: user.id } });
  revalidatePath("/portal/inventory");
  return { ok: true, message: "Asset assigned." };
}

export async function returnAsset(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const a = await prisma.assetAssignment.findFirst({ where: { id: text(f, "assignmentId"), tenantId: ctx.tenantId! }, include: { item: true } });
  if (!a) return { error: "Assignment not found." };
  if (!canForCampus(ctx, "inventory.asset.manage", a.item.campusId)) return { error: "Permission denied." };
  if (a.returnedAt) return { error: "Already returned." };
  await prisma.assetAssignment.update({ where: { id: a.id }, data: { returnedAt: new Date() } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.asset.returned", targetType: "AssetAssignment", targetId: a.id, campusId: a.item.campusId });
  revalidatePath("/portal/inventory");
  return { ok: true, message: "Asset returned." };
}
