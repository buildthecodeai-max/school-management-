"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus, canAnywhere } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { requestApproval } from "@/lib/approvals";
import { parseLines, isLow, MAX_QTY } from "@/lib/inventory";

export interface InventoryActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const text = (f: FormData, k: string, max = 120) => String(f.get(k) ?? "").trim().slice(0, max);

async function stockOf(db: Pick<typeof prisma, "stockLedgerEntry">, tenantId: string, itemId: string): Promise<number> {
  const r = await db.stockLedgerEntry.aggregate({ where: { tenantId, itemId }, _sum: { qty: true } });
  return r._sum.qty ?? 0;
}

// ---- catalog ---------------------------------------------------------------

export async function createCategory(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId");
  if (!canForCampus(ctx, "inventory.write", campusId)) return { error: "Permission denied." };
  const name = text(f, "name", 60);
  if (!name) return { error: "Enter a category name." };
  if (!(await prisma.campus.findFirst({ where: { id: campusId, tenantId: ctx.tenantId! }, select: { id: true } }))) return { error: "Campus not found." };
  if (await prisma.inventoryCategory.findFirst({ where: { tenantId: ctx.tenantId!, campusId, name } })) return { error: `Category "${name}" already exists.` };
  const c = await prisma.inventoryCategory.create({ data: { tenantId: ctx.tenantId!, campusId, name } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.category.created", targetType: "InventoryCategory", targetId: c.id, campusId, metadata: { name } });
  revalidatePath("/portal/inventory");
  return { ok: true, message: `Category "${name}" added.` };
}

export async function createSupplier(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  if (!canAnywhere(ctx, "inventory.po.manage")) return { error: "Permission denied." };
  const name = text(f, "name", 80);
  if (!name) return { error: "Enter the supplier name." };
  const email = text(f, "email", 120) || null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (await prisma.supplier.findFirst({ where: { tenantId: ctx.tenantId!, name } })) return { error: `Supplier "${name}" already exists.` };
  const s = await prisma.supplier.create({ data: { tenantId: ctx.tenantId!, name, email, phone: text(f, "phone", 30) || null } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.supplier.created", targetType: "Supplier", targetId: s.id, metadata: { name } });
  revalidatePath("/portal/inventory");
  return { ok: true, message: `Supplier "${name}" added.` };
}

export async function createItem(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId");
  if (!canForCampus(ctx, "inventory.write", campusId)) return { error: "Permission denied." };
  const name = text(f, "name", 80);
  if (!name) return { error: "Enter the item name." };
  const category = await prisma.inventoryCategory.findFirst({ where: { id: text(f, "categoryId"), tenantId: ctx.tenantId!, campusId }, select: { id: true } });
  if (!category) return { error: "Choose a category from this campus." };
  const supplierId = text(f, "supplierId") || null;
  if (supplierId && !(await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: ctx.tenantId! }, select: { id: true } }))) return { error: "Supplier not found." };
  const reorder = Number(f.get("reorderThreshold") || 0);
  const opening = Number(f.get("openingStock") || 0);
  if (!Number.isInteger(reorder) || reorder < 0 || reorder > MAX_QTY) return { error: "Reorder level must be a whole number, 0 or more." };
  if (!Number.isInteger(opening) || opening < 0 || opening > MAX_QTY) return { error: "Opening stock must be a whole number, 0 or more." };
  if (await prisma.inventoryItem.findFirst({ where: { tenantId: ctx.tenantId!, campusId, name } })) return { error: `"${name}" already exists on this campus.` };

  const item = await prisma.$transaction(async (tx) => {
    const it = await tx.inventoryItem.create({ data: { tenantId: ctx.tenantId!, campusId, categoryId: category.id, supplierId, name, unit: text(f, "unit", 20) || "pcs", reorderThreshold: reorder } });
    if (opening > 0) await tx.stockLedgerEntry.create({ data: { tenantId: ctx.tenantId!, itemId: it.id, qty: opening, reason: "ADJUSTMENT", reference: "Opening stock" } });
    return it;
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.item.created", targetType: "InventoryItem", targetId: item.id, campusId, metadata: { name, opening } });
  revalidatePath("/portal/inventory");
  return { ok: true, message: `"${name}" added.` };
}

// ---- stock -----------------------------------------------------------------

export async function adjustStock(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  // The campus comes from the item itself, never from the form.
  const item = await prisma.inventoryItem.findFirst({ where: { id: text(f, "itemId"), tenantId: ctx.tenantId! } });
  if (!item) return { error: "Item not found." };
  if (!canForCampus(ctx, "inventory.write", item.campusId)) return { error: "Permission denied." };
  const qty = Number(f.get("qty"));
  if (!Number.isInteger(qty) || qty === 0 || Math.abs(qty) > MAX_QTY) return { error: "Enter a whole-number change (use a minus sign to remove stock)." };
  const reason = text(f, "reason", 200);
  if (reason.length < 3) return { error: "Give a reason for the adjustment." };

  const result = await prisma.$transaction(async (tx) => {
    const current = await stockOf(tx, ctx.tenantId!, item.id);
    if (current + qty < 0) return { error: `Only ${current} ${item.unit} in stock; cannot remove ${-qty}.` } as const;
    const entry = await tx.stockLedgerEntry.create({ data: { tenantId: ctx.tenantId!, itemId: item.id, qty, reason: "ADJUSTMENT", reference: reason } });
    return { entry, after: current + qty } as const;
  });
  if ("error" in result) return { error: result.error };

  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.stock.adjusted", targetType: "StockLedgerEntry", targetId: result.entry.id, campusId: item.campusId, metadata: { itemId: item.id, qty, reason, after: result.after } });
  await lowStockAlert(ctx.tenantId!, item, result.after);
  revalidatePath("/portal/inventory");
  return { ok: true, message: `Stock adjusted. ${result.after} ${item.unit} on hand.` };
}

// Notify users who can actually act on it: inventory.write holders on the item's campus.
async function lowStockAlert(tenantId: string, item: { id: string; name: string; unit: string; campusId: string; reorderThreshold: number }, stock: number) {
  if (!isLow(stock, item.reorderThreshold)) return;
  const assignments = await prisma.roleAssignment.findMany({
    where: {
      user: { tenantId },
      role: { permissions: { has: "inventory.write" } },
      OR: [{ scopeType: "ORG" }, { campusId: item.campusId }],
    },
    select: { userId: true },
  });
  const day = new Date().toISOString().slice(0, 10);
  for (const userId of new Set(assignments.map((a) => a.userId).filter(Boolean) as string[])) {
    await notify({ tenantId, recipientUserId: userId, category: "ANNOUNCEMENT", title: `Low stock: ${item.name}`, body: `${item.name} is at or below its reorder level (${stock} ${item.unit} left).`, dedupeKey: `inventory:lowstock:${item.id}:${day}:${userId}` });
  }
}

// ---- requisitions ----------------------------------------------------------

export async function submitRequisition(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId");
  if (!canForCampus(ctx, "inventory.requisition.request", campusId)) return { error: "Permission denied." };
  const parsed = parseLines(String(f.get("lines") ?? ""));
  if (!parsed.ok) return { error: parsed.error };
  const items = await prisma.inventoryItem.findMany({ where: { tenantId: ctx.tenantId!, campusId, id: { in: parsed.lines.map((l) => l.itemId) } }, select: { id: true } });
  if (items.length !== parsed.lines.length) return { error: "A requested item does not exist on this campus." };
  const notes = text(f, "notes", 500) || null;

  const req = await prisma.requisition.create({
    data: { tenantId: ctx.tenantId!, campusId, requestedByUserId: ctx.user.id, status: "SUBMITTED", notes, lines: { create: parsed.lines.map((l) => ({ tenantId: ctx.tenantId!, itemId: l.itemId, qty: l.qty })) } },
  });
  await requestApproval({ tenantId: ctx.tenantId!, campusId, requestType: "inventory.requisition", referenceType: "Requisition", referenceId: req.id, requestedByUserId: ctx.user.id, payload: { campusId, notes, lines: parsed.lines } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.requisition.submitted", targetType: "Requisition", targetId: req.id, campusId, metadata: { lineCount: parsed.lines.length } });
  revalidatePath("/portal/inventory");
  return { ok: true, message: "Requisition submitted for approval." };
}

/** Issue stock for an approved requisition (inventory.write). All-or-nothing. */
export async function fulfillRequisition(_p: InventoryActionState, f: FormData): Promise<InventoryActionState> {
  const ctx = await requireUser();
  const req = await prisma.requisition.findFirst({ where: { id: text(f, "requisitionId"), tenantId: ctx.tenantId! }, include: { lines: { include: { item: true } } } });
  if (!req) return { error: "Requisition not found." };
  if (!canForCampus(ctx, "inventory.write", req.campusId)) return { error: "Permission denied." };
  if (req.status !== "APPROVED") return { error: "Only an approved requisition can be fulfilled." };

  const result = await prisma.$transaction(async (tx) => {
    // Claim it first so a double click cannot issue stock twice.
    const claimed = await tx.requisition.updateMany({ where: { id: req.id, status: "APPROVED" }, data: { status: "FULFILLED" } });
    if (claimed.count === 0) return { error: "This requisition was already fulfilled." } as const;
    const after: { item: (typeof req.lines)[number]["item"]; stock: number }[] = [];
    for (const l of req.lines) {
      const current = await stockOf(tx, ctx.tenantId!, l.itemId);
      if (current < l.qty) throw new ShortStock(`Not enough ${l.item.name}: ${current} ${l.item.unit} in stock, ${l.qty} requested.`);
      await tx.stockLedgerEntry.create({ data: { tenantId: ctx.tenantId!, itemId: l.itemId, qty: -l.qty, reason: "REQUISITION", reference: req.id } });
      after.push({ item: l.item, stock: current - l.qty });
    }
    return { after } as const;
  }).catch((e) => (e instanceof ShortStock ? ({ error: e.message } as const) : Promise.reject(e)));
  if ("error" in result) return { error: result.error };

  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "inventory.requisition.fulfilled", targetType: "Requisition", targetId: req.id, campusId: req.campusId, metadata: { lines: req.lines.length } });
  for (const a of result.after) await lowStockAlert(ctx.tenantId!, a.item, a.stock);
  await notify({ tenantId: ctx.tenantId!, recipientUserId: req.requestedByUserId, category: "ANNOUNCEMENT", title: "Requisition fulfilled", body: "The stock you requested has been issued.", relatedType: "requisition", relatedId: req.id, dedupeKey: `inventory:fulfilled:${req.id}` });
  revalidatePath("/portal/inventory");
  return { ok: true, message: "Stock issued and requisition fulfilled." };
}

class ShortStock extends Error {}
