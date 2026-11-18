import Link from "next/link";
import { requirePermission, canForCampus, canAnywhere } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";
import { PageHeader, Card, Badge, ButtonLink } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { LinesForm } from "@/components/LinesEditor";
import { formatMoney } from "@/lib/money";
import { isLow, PO_NEXT } from "@/lib/inventory";
import { createCategory, createItem, createSupplier, adjustStock, fulfillRequisition } from "./actions";
import { createPurchaseOrder, setPurchaseOrderStatus, assignAsset, returnAsset } from "./po-actions";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ campusId?: string }> }) {
  const ctx = await requirePermission("inventory.read");
  const params = await searchParams;
  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, orderBy: { name: "asc" } });
  const accessible = campuses.filter((c) => canForCampus(ctx, "inventory.read", c.id));
  const preferred = await preferredCampusId(ctx, "inventory.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);

  const canWrite = campusId ? canForCampus(ctx, "inventory.write", campusId) : false;
  const canRequest = campusId ? canForCampus(ctx, "inventory.requisition.request", campusId) : false;
  const canPo = campusId ? canForCampus(ctx, "inventory.po.manage", campusId) : false;
  const canAsset = campusId ? canForCampus(ctx, "inventory.asset.manage", campusId) : false;
  const canSupplier = canAnywhere(ctx, "inventory.po.manage");

  const [items, categories, suppliers, requisitions, pos, assignments, users] = campusId
    ? await Promise.all([
        prisma.inventoryItem.findMany({ where: { tenantId: ctx.tenantId!, campusId }, include: { category: true }, orderBy: { name: "asc" }, take: 300 }),
        prisma.inventoryCategory.findMany({ where: { tenantId: ctx.tenantId!, campusId }, orderBy: { name: "asc" } }),
        prisma.supplier.findMany({ where: { tenantId: ctx.tenantId! }, orderBy: { name: "asc" } }),
        prisma.requisition.findMany({ where: { tenantId: ctx.tenantId!, campusId, status: { in: ["SUBMITTED", "APPROVED"] } }, include: { lines: { include: { item: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
        prisma.purchaseOrder.findMany({ where: { tenantId: ctx.tenantId!, campusId, status: { in: ["DRAFT", "SENT"] } }, include: { supplier: true, lines: { include: { item: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
        prisma.assetAssignment.findMany({ where: { tenantId: ctx.tenantId!, returnedAt: null, item: { campusId } }, include: { item: true, assignedTo: true }, orderBy: { assignedAt: "desc" }, take: 50 }),
        canAsset ? prisma.user.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, select: { id: true, email: true }, orderBy: { email: "asc" }, take: 300 }) : Promise.resolve([]),
      ])
    : [[], [], [], [], [], [], []];

  const totals = items.length
    ? await prisma.stockLedgerEntry.groupBy({ by: ["itemId"], where: { tenantId: ctx.tenantId!, itemId: { in: items.map((i) => i.id) } }, _sum: { qty: true } })
    : [];
  const stock = new Map(totals.map((t) => [t.itemId, t._sum.qty ?? 0]));
  const low = items.filter((i) => isLow(stock.get(i.id) ?? 0, i.reorderThreshold));
  const th = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Inventory"
        subtitle="Items, stock, requisitions, purchase orders and assigned assets"
        action={campusId && canRequest ? <ButtonLink href={`/portal/inventory/requisition/new?campusId=${campusId}`}>New requisition</ButtonLink> : undefined}
      />
      <div className="flex flex-wrap gap-2">
        {accessible.map((c) => (
          <Link key={c.id} href={`?campusId=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${c.id === campusId ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"}`}>{c.name}</Link>
        ))}
      </div>

      {low.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">{low.length} item(s) at or below the reorder level</p>
          <ul className="mt-1 list-inside list-disc">{low.map((i) => <li key={i.id}>{i.name}: {stock.get(i.id) ?? 0} {i.unit} (reorder at {i.reorderThreshold})</li>)}</ul>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Stock ({items.length})</h2>
        <Card>
          {items.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No items yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>Item</th><th className={th}>Category</th><th className={`${th} text-right`}>In stock</th><th className={`${th} text-right`}>Reorder at</th></tr></thead>
                <tbody className="divide-y divide-[color:var(--color-line)]">
                  {items.map((i) => {
                    const q = stock.get(i.id) ?? 0;
                    const l = isLow(q, i.reorderThreshold);
                    return (
                      <tr key={i.id} className={l ? "bg-amber-50" : ""}>
                        <td className="py-2 pr-4 font-medium">{i.name}</td>
                        <td className="py-2 pr-4">{i.category.name}</td>
                        <td className={`py-2 pr-4 text-right font-medium ${l ? "text-amber-700" : ""}`}>{q} {i.unit}</td>
                        <td className="py-2 text-right text-[color:var(--color-muted)]">{i.reorderThreshold || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        {canWrite && campusId && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Adjust stock</h3>
              {items.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">Add an item first.</p> : (
                <ActionForm action={adjustStock} submit="Record adjustment" pendingLabel="Saving…" className="grid gap-3 sm:grid-cols-2">
                  <label className="sm:col-span-2"><span className={labelCls}>Item</span><select name="itemId" required className={inputCls}>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
                  <label><span className={labelCls}>Change (− to remove)</span><input name="qty" type="number" required className={inputCls} /></label>
                  <label><span className={labelCls}>Reason</span><input name="reason" required minLength={3} maxLength={200} placeholder="e.g. Stock count" className={inputCls} /></label>
                </ActionForm>
              )}
            </Card>
            <Card>
              <h3 className="mb-3 text-sm font-semibold">Add an item</h3>
              {categories.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">Create a category first (below).</p> : (
                <ActionForm action={createItem} submit="Add item" pendingLabel="Adding…" className="grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="campusId" value={campusId} />
                  <label><span className={labelCls}>Name</span><input name="name" required maxLength={80} className={inputCls} /></label>
                  <label><span className={labelCls}>Category</span><select name="categoryId" required className={inputCls}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <label><span className={labelCls}>Unit</span><input name="unit" defaultValue="pcs" maxLength={20} className={inputCls} /></label>
                  <label><span className={labelCls}>Supplier</span><select name="supplierId" className={inputCls}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                  <label><span className={labelCls}>Reorder level</span><input name="reorderThreshold" type="number" min={0} defaultValue={0} className={inputCls} /></label>
                  <label><span className={labelCls}>Opening stock</span><input name="openingStock" type="number" min={0} defaultValue={0} className={inputCls} /></label>
                </ActionForm>
              )}
              <ActionForm action={createCategory} submit="Add category" variant="ghost" className="mt-4 flex items-end gap-2">
                <input type="hidden" name="campusId" value={campusId} />
                <input name="name" required maxLength={60} placeholder="New category name" className={inputCls} />
              </ActionForm>
            </Card>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Requisitions ({requisitions.length})</h2>
        {requisitions.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">None open.</p> : (
          <div className="space-y-3">
            {requisitions.map((r) => (
              <Card key={r.id}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Badge tone={r.status === "APPROVED" ? "green" : "amber"}>{r.status}</Badge>
                    <span className="ml-3 text-sm">{r.lines.map((l) => `${l.qty}× ${l.item.name}`).join(", ")}</span>
                  </div>
                  {r.status === "APPROVED" && canWrite && (
                    <ActionForm action={fulfillRequisition} submit="Issue stock" confirmText="Issue this stock now?">
                      <input type="hidden" name="requisitionId" value={r.id} />
                    </ActionForm>
                  )}
                  {r.status === "SUBMITTED" && <Link href="/portal/approvals" className="text-sm text-brand-700 hover:underline">Awaiting approval</Link>}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Purchase orders ({pos.length})</h2>
        <div className="space-y-3">
          {pos.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Badge tone={p.status === "SENT" ? "sky" : "amber"}>{p.status}</Badge>
                  <span className="ml-3 text-sm font-medium">{p.supplier.name}</span>
                  <span className="ml-2 text-sm text-[color:var(--color-muted)]">{formatMoney(p.totalAmount)}</span>
                  <p className="mt-1 text-sm text-[color:var(--color-muted)]">{p.lines.map((l) => `${l.qty}× ${l.item.name}`).join(", ")}</p>
                </div>
                {canPo && (
                  <div className="flex gap-2">
                    {PO_NEXT[p.status].filter((to) => !(p.status === "DRAFT" && to === "RECEIVED")).map((to) => (
                      <ActionForm key={to} action={setPurchaseOrderStatus} submit={to === "SENT" ? "Mark sent" : to === "RECEIVED" ? "Receive stock" : "Cancel"} variant={to === "CANCELLED" ? "danger" : to === "RECEIVED" ? "primary" : "ghost"} confirmText={to === "CANCELLED" ? "Cancel this order?" : to === "RECEIVED" ? "Receive these items into stock?" : undefined}>
                        <input type="hidden" name="poId" value={p.id} /><input type="hidden" name="to" value={to} />
                      </ActionForm>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
        {canPo && campusId && (
          <Card className="mt-4">
            <h3 className="mb-3 text-sm font-semibold">New purchase order</h3>
            {suppliers.length === 0 || items.length === 0 ? (
              <p className="text-sm text-[color:var(--color-muted)]">Add a supplier and at least one item first.</p>
            ) : (
              <LinesForm
                action={createPurchaseOrder}
                items={items.map((i) => ({ id: i.id, label: i.name }))}
                withCost
                hidden={{ campusId }}
                submit="Create purchase order"
                extra={<label className="block"><span className={labelCls}>Supplier</span><select name="supplierId" required className={inputCls}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
              />
            )}
          </Card>
        )}
        {canSupplier && (
          <Card className="mt-4">
            <h3 className="mb-3 text-sm font-semibold">Add a supplier</h3>
            <ActionForm action={createSupplier} submit="Add supplier" variant="ghost" className="grid gap-3 sm:grid-cols-3">
              <label><span className={labelCls}>Name</span><input name="name" required maxLength={80} className={inputCls} /></label>
              <label><span className={labelCls}>Email</span><input name="email" type="email" maxLength={120} className={inputCls} /></label>
              <label><span className={labelCls}>Phone</span><input name="phone" maxLength={30} className={inputCls} /></label>
            </ActionForm>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Assigned assets ({assignments.length})</h2>
        <Card>
          {assignments.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">Nothing is assigned.</p> : (
            <ul className="divide-y divide-[color:var(--color-line)] text-sm">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span><span className="font-medium">{a.item.name}</span> → {a.assignedTo.email} <span className="text-xs text-[color:var(--color-muted)]">since {a.assignedAt.toLocaleDateString()}</span></span>
                  {canAsset && <ActionForm action={returnAsset} submit="Mark returned" variant="ghost"><input type="hidden" name="assignmentId" value={a.id} /></ActionForm>}
                </li>
              ))}
            </ul>
          )}
          {canAsset && items.length > 0 && (
            <ActionForm action={assignAsset} submit="Assign" pendingLabel="Assigning…" className="mt-4 flex flex-wrap items-end gap-2">
              <label><span className={labelCls}>Item</span><select name="itemId" className={inputCls}>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
              <label><span className={labelCls}>Person</span><select name="assignedToUserId" className={inputCls}>{users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select></label>
              <label><span className={labelCls}>Note</span><input name="notes" maxLength={200} className={inputCls} /></label>
            </ActionForm>
          )}
        </Card>
      </section>
    </div>
  );
}
