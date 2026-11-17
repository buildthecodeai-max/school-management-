import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { AddBookForm, ReturnBookForm } from "./LibraryForms";

export const metadata = { title: "Library" };

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string; q?: string }>;
}) {
  const ctx = await requirePermission("library.read");
  const params = await searchParams;

  const campuses = await prisma.campus.findMany({
    where: { tenantId: ctx.tenantId!, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const campusId =
    params.campusId ??
    campuses.find((c) => canForCampus(ctx, "library.read", c.id))?.id;

  const q = params.q?.trim();

  const items = campusId
    ? await prisma.libraryItem.findMany({
        where: {
          tenantId: ctx.tenantId!,
          campusId,
          ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
        },
        include: {
          author: true,
          category: true,
          copies: true,
        },
        orderBy: { title: "asc" },
        take: 50,
      })
    : [];

  const categories = campusId
    ? await prisma.libraryCategory.findMany({
        where: { tenantId: ctx.tenantId!, campusId },
        orderBy: { name: "asc" },
      })
    : [];

  const activeLoans = campusId
    ? await prisma.libraryCirculation.findMany({
        where: {
          tenantId: ctx.tenantId!,
          campusId,
          type: "ISSUE",
          returnedAt: null,
        },
        include: { copy: { include: { item: true } }, borrower: true },
        orderBy: { dueDate: "asc" },
        take: 20,
      })
    : [];

  const canCirculate = campusId ? canForCampus(ctx, "library.circulate", campusId) : false;

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Library</h1>
        {canCirculate && campusId && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/portal/library/issue?campusId=${campusId}`}
              className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Issue book
            </Link>
          </div>
        )}
      </div>

      {canCirculate && campusId && (
        <div className="space-y-3">
          <ReturnBookForm campusId={campusId} />
          <AddBookForm campusId={campusId} categories={categories} />
        </div>
      )}

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

      {/* Search */}
      <form className="flex gap-2">
        <input type="hidden" name="campusId" value={campusId ?? ""} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by title…"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200">Search</button>
      </form>

      {/* Catalog */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Catalog ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-gray-500">No items found.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Author</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-center">Available / Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => {
                  const avail = item.copies.filter((c) => c.status === "AVAILABLE").length;
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{item.title}</td>
                      <td className="px-3 py-2">{item.author?.name ?? "—"}</td>
                      <td className="px-3 py-2">{item.category.name}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={avail > 0 ? "text-emerald-700" : "text-red-600"}>
                          {avail}/{item.copies.length}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Active loans */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Active loans ({activeLoans.length})</h2>
        {activeLoans.length === 0 ? (
          <p className="text-gray-500">No active loans.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Borrower</th>
                  <th className="px-3 py-2 text-left">Due date</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeLoans.map((loan) => {
                  const overdue = loan.dueDate && new Date() > loan.dueDate;
                  return (
                    <tr key={loan.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">{loan.copy.item.title}</td>
                      <td className="px-3 py-2">{loan.borrower.displayName}</td>
                      <td className="px-3 py-2">{loan.dueDate?.toLocaleDateString() ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={overdue ? "text-red-600 font-medium" : "text-emerald-700"}>
                          {overdue ? "Overdue" : "On loan"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
