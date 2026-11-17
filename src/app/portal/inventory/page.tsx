import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string }>;
}) {
  const ctx = await requirePermission("inventory.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const accessible = campuses.filter((c) => canForCampus(ctx, "inventory.read", c.id));
  const preferred = await preferredCampusId(ctx, "inventory.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);

  const items = campusId
    ? await prisma.inventoryItem.findMany({
        where: { tenantId: ctx.tenantId!, campusId },
        include: { category: true },
        orderBy: { name: "asc" },
        take: 100,
      })
    : [];

  // Get current stock for each item via ledger sum.
  const itemIds = items.map((i) => i.id);
  const stockTotals =
    itemIds.length > 0
      ? await prisma.stockLedgerEntry.groupBy({
          by: ["itemId"],
          where: { tenantId: ctx.tenantId!, itemId: { in: itemIds } },
          _sum: { qty: true },
        })
      : [];

  const stockMap = new Map(stockTotals.map((s) => [s.itemId, s._sum.qty ?? 0]));

  const requisitions = campusId
    ? await prisma.requisition.findMany({
        where: { tenantId: ctx.tenantId!, campusId, status: { in: ["SUBMITTED", "APPROVED"] } },
        include: { lines: { include: { item: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];

  const lowStock = items.filter(
    (i) => i.reorderThreshold > 0 && (stockMap.get(i.id) ?? 0) <= i.reorderThreshold,
  );

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Inventory</h1>
        {campusId && canForCampus(ctx, "inventory.requisition.request", campusId) && (
          <Link
            href={`/portal/inventory/requisition/new?campusId=${campusId}`}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New requisition
          </Link>
        )}
      </div>

      {/* Campus tabs */}
      <div className="flex gap-2 flex-wrap">
        {campuses.map((c) => (
          <a
            key={c.id}
            href={`?campusId=${c.id}`}
            className={`rounded-full px-3 py-1 text-sm font-medium border ${
              c.id === campusId
                ? "bg-indigo-600 text-white border-indigo-600"
                : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            {c.name}
          </a>
        ))}
      </div>

      {/* Low-stock alerts */}
      {lowStock.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">
            {lowStock.length} item(s) at or below reorder threshold:
          </p>
          <ul className="mt-1 list-disc list-inside text-sm text-amber-700">
            {lowStock.map((i) => (
              <li key={i.id}>
                {i.name} — {stockMap.get(i.id) ?? 0} {i.unit} (threshold: {i.reorderThreshold})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stock list */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Stock ({items.length} items)</h2>
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-right">In stock</th>
                <th className="px-3 py-2 text-right">Reorder at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-gray-400">No items.</td>
                </tr>
              )}
              {items.map((item) => {
                const qty = stockMap.get(item.id) ?? 0;
                const low = item.reorderThreshold > 0 && qty <= item.reorderThreshold;
                return (
                  <tr key={item.id} className={`hover:bg-gray-50 ${low ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-2 font-medium">{item.name}</td>
                    <td className="px-3 py-2">{item.category.name}</td>
                    <td className={`px-3 py-2 text-right font-medium ${low ? "text-amber-700" : ""}`}>
                      {qty} {item.unit}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">{item.reorderThreshold || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Requisitions */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Active requisitions ({requisitions.length})</h2>
        {requisitions.length === 0 ? (
          <p className="text-gray-500">None.</p>
        ) : (
          requisitions.map((r) => (
            <div key={r.id} className="rounded border border-gray-200 p-3 text-sm">
              <span className="font-medium">Requisition</span>
              <span className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${
                r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}>{r.status}</span>
              <div className="mt-1 text-gray-500">
                {r.lines.map((l) => `${l.qty}× ${l.item.name}`).join(", ")}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
