import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { createCategory, createItem, createSupplier, adjustStock, submitRequisition, fulfillRequisition } from "@/app/portal/inventory/actions";
import { createPurchaseOrder, setPurchaseOrderStatus, assignAsset, returnAsset } from "@/app/portal/inventory/po-actions";
import { prisma, makeTenant, makeCampus, makeUser, authContextFor, cleanupAll } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const ALL = ["inventory.read", "inventory.write", "inventory.requisition.request", "inventory.po.manage", "inventory.asset.manage"];

describe("inventory", () => {
  let tenantId: string, campusId: string, otherCampus: string, foreignItem: string, foreignAssignment: string;
  let admin: unknown, requester: unknown, otherCampusAdmin: unknown, adminUserId: string;
  let categoryId: string, itemId: string, supplierId: string;
  const stock = async (id: string) => (await prisma.stockLedgerEntry.aggregate({ where: { itemId: id }, _sum: { qty: true } }))._sum.qty ?? 0;

  beforeAll(async () => {
    tenantId = (await makeTenant("Inv Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    const u = await makeUser({ tenantId, permissions: ALL, scope: "CAMPUS", campusId });
    adminUserId = u.id;
    admin = await authContextFor(u.id);
    requester = await authContextFor((await makeUser({ tenantId, permissions: ["inventory.read", "inventory.requisition.request"], scope: "CAMPUS", campusId })).id);
    otherCampusAdmin = await authContextFor((await makeUser({ tenantId, permissions: ALL, scope: "CAMPUS", campusId: otherCampus })).id);
    // another school's item and asset assignment
    const t2 = (await makeTenant("Other Inv Org")).id;
    const c2 = (await makeCampus(t2, "X")).id;
    const cat2 = await prisma.inventoryCategory.create({ data: { tenantId: t2, campusId: c2, name: "Cat" } });
    foreignItem = (await prisma.inventoryItem.create({ data: { tenantId: t2, campusId: c2, categoryId: cat2.id, name: "Secret" } })).id;
    const u2 = await makeUser({ tenantId: t2, permissions: [], scope: "ORG" });
    foreignAssignment = (await prisma.assetAssignment.create({ data: { tenantId: t2, itemId: foreignItem, assignedToUserId: u2.id } })).id;
  });
  afterAll(cleanupAll);

  it("builds the catalog with permission and uniqueness checks", async () => {
    current = requester;
    expect((await createCategory({}, fd({ campusId, name: "Stationery" }))).error).toMatch(/permission/i);
    current = admin;
    expect((await createCategory({}, fd({ campusId, name: "Stationery" }))).ok).toBe(true);
    expect((await createCategory({}, fd({ campusId, name: "Stationery" }))).error).toMatch(/already exists/i);
    categoryId = (await prisma.inventoryCategory.findFirstOrThrow({ where: { tenantId } })).id;
    expect((await createSupplier({}, fd({ name: "Acme", email: "bad" }))).error).toMatch(/valid email/i);
    expect((await createSupplier({}, fd({ name: "Acme", email: "sales@acme.test" }))).ok).toBe(true);
    supplierId = (await prisma.supplier.findFirstOrThrow({ where: { tenantId } })).id;
    expect((await createItem({}, fd({ campusId, name: "Pens", categoryId: "nope" }))).error).toMatch(/category/i);
    expect((await createItem({}, fd({ campusId, name: "Pens", categoryId, reorderThreshold: "5", openingStock: "10" }))).ok).toBe(true);
    expect((await createItem({}, fd({ campusId, name: "Pens", categoryId }))).error).toMatch(/already exists/i);
    itemId = (await prisma.inventoryItem.findFirstOrThrow({ where: { tenantId, name: "Pens" } })).id;
    expect(await stock(itemId)).toBe(10);
  });

  it("adjusts stock only for items of this school and campus, never below zero, with a reason", async () => {
    current = admin;
    expect((await adjustStock({}, fd({ itemId: foreignItem, qty: "5", reason: "hack" }))).error).toMatch(/item not found/i);
    expect(await stock(foreignItem)).toBe(0);
    current = otherCampusAdmin;
    expect((await adjustStock({}, fd({ itemId, qty: "5", reason: "wrong campus" }))).error).toMatch(/permission/i);
    current = admin;
    expect((await adjustStock({}, fd({ itemId, qty: "0", reason: "none" }))).error).toMatch(/whole-number/i);
    expect((await adjustStock({}, fd({ itemId, qty: "-3" }))).error).toMatch(/reason/i);
    expect((await adjustStock({}, fd({ itemId, qty: "-11", reason: "count" }))).error).toMatch(/only 10/i);
    expect((await adjustStock({}, fd({ itemId, qty: "-4", reason: "count" }))).ok).toBe(true);
    expect(await stock(itemId)).toBe(6);
  });

  it("validates requisition lines, then fulfils an approved one exactly once, all-or-nothing", async () => {
    current = requester;
    const lines = (l: unknown) => JSON.stringify(l);
    expect((await submitRequisition({}, fd({ campusId, lines: lines([{ itemId: foreignItem, qty: 1 }]) }))).error).toMatch(/does not exist/i);
    expect((await submitRequisition({}, fd({ campusId, lines: lines([{ itemId, qty: 0 }]) }))).error).toMatch(/whole numbers/i);
    expect((await submitRequisition({}, fd({ campusId, lines: lines([{ itemId, qty: 4 }]) }))).ok).toBe(true);
    const req = await prisma.requisition.findFirstOrThrow({ where: { tenantId } });
    expect(req.status).toBe("SUBMITTED");

    current = admin;
    expect((await fulfillRequisition({}, fd({ requisitionId: req.id }))).error).toMatch(/approved/i);
    await prisma.requisition.update({ where: { id: req.id }, data: { status: "APPROVED" } });
    // make stock short, expect rollback
    await adjustStock({}, fd({ itemId, qty: "-5", reason: "loss" }));
    expect((await fulfillRequisition({}, fd({ requisitionId: req.id }))).error).toMatch(/not enough pens/i);
    expect((await prisma.requisition.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
    expect(await stock(itemId)).toBe(1);
    await adjustStock({}, fd({ itemId, qty: "9", reason: "found" }));
    expect((await fulfillRequisition({}, fd({ requisitionId: req.id }))).ok).toBe(true);
    expect(await stock(itemId)).toBe(6);
    expect((await fulfillRequisition({}, fd({ requisitionId: req.id }))).error).toMatch(/approved/i);
    expect(await stock(itemId)).toBe(6);
  });

  it("creates purchase orders with a computed total and receives stock exactly once, even concurrently", async () => {
    current = admin;
    const po = (lines: unknown, extra: Record<string, string> = {}) => createPurchaseOrder({}, fd({ campusId, supplierId, lines: JSON.stringify(lines), ...extra }));
    expect((await po([{ itemId, qty: 2, unitCost: "1.234" }])).error).toMatch(/12\.50/);
    expect((await po([{ itemId: foreignItem, qty: 2, unitCost: "1" }])).error).toMatch(/does not exist/i);
    expect((await po([{ itemId, qty: 2, unitCost: "1" }], { supplierId: "nope" })).error).toMatch(/supplier/i);
    expect((await po([{ itemId, qty: 4, unitCost: "2.50" }])).ok).toBe(true);
    const order = await prisma.purchaseOrder.findFirstOrThrow({ where: { tenantId } });
    expect(order.totalAmount).toBe(1000);

    current = requester;
    expect((await setPurchaseOrderStatus({}, fd({ poId: order.id, to: "RECEIVED" }))).error).toMatch(/permission/i);
    current = admin;
    expect((await setPurchaseOrderStatus({}, fd({ poId: order.id, to: "SENT" }))).ok).toBe(true);
    const results = await Promise.all([1, 2, 3].map(() => setPurchaseOrderStatus({}, fd({ poId: order.id, to: "RECEIVED" }))));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await stock(itemId)).toBe(10);
    expect((await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } })).receivedAt).not.toBeNull();
    expect((await setPurchaseOrderStatus({}, fd({ poId: order.id, to: "CANCELLED" }))).error).toMatch(/cannot become/i);
  });

  it("assigns assets only to people of this school, within owned units, and guards returns", async () => {
    current = admin;
    const foreignUser = (await prisma.assetAssignment.findUniqueOrThrow({ where: { id: foreignAssignment } })).assignedToUserId;
    expect((await assignAsset({}, fd({ itemId, assignedToUserId: foreignUser }))).error).toMatch(/person from this school/i);
    expect((await assignAsset({}, fd({ itemId: foreignItem, assignedToUserId: adminUserId }))).error).toMatch(/item not found/i);
    for (let i = 0; i < 10; i++) expect((await assignAsset({}, fd({ itemId, assignedToUserId: adminUserId }))).ok).toBe(true);
    expect((await assignAsset({}, fd({ itemId, assignedToUserId: adminUserId }))).error).toMatch(/already assigned/i);
    expect((await returnAsset({}, fd({ assignmentId: foreignAssignment }))).error).toMatch(/not found/i);
    expect((await prisma.assetAssignment.findUniqueOrThrow({ where: { id: foreignAssignment } })).returnedAt).toBeNull();
    const mine = await prisma.assetAssignment.findFirstOrThrow({ where: { tenantId, itemId } });
    expect((await returnAsset({}, fd({ assignmentId: mine.id }))).ok).toBe(true);
    expect((await returnAsset({}, fd({ assignmentId: mine.id }))).error).toMatch(/already returned/i);
    expect((await assignAsset({}, fd({ itemId, assignedToUserId: adminUserId }))).ok).toBe(true);
  });
});
