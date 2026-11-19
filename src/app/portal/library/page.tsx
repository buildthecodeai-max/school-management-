import Link from "next/link";
import { requirePermission, canForCampus } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { preferredCampusId, resolveCampusId } from "@/lib/campus-preference";
import { PageHeader, Card, Badge } from "@/components/ui";
import { ActionForm, inputCls, labelCls } from "@/components/ActionForm";
import { formatMoney } from "@/lib/money";
import { LOAN_DAYS, MAX_RENEWALS } from "@/lib/library";
import { addBook, createLibraryCategory, issueBook, returnBook, renewLoan, reserveBook, cancelReservation, settleFine } from "./actions";

export const metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ campusId?: string; q?: string }> }) {
  const ctx = await requirePermission("library.read");
  const params = await searchParams;
  const campuses = await prisma.campus.findMany({ where: { tenantId: ctx.tenantId!, status: "ACTIVE" }, orderBy: { name: "asc" } });
  const accessible = campuses.filter((c) => canForCampus(ctx, "library.read", c.id));
  const preferred = await preferredCampusId(ctx, "library.read");
  const campusId = resolveCampusId(params.campusId, preferred, accessible);
  const q = params.q?.trim();
  const canCirculate = campusId ? canForCampus(ctx, "library.circulate", campusId) : false;
  const canCatalog = campusId ? canForCampus(ctx, "library.catalog.write", campusId) : false;
  const canFines = campusId ? canForCampus(ctx, "library.fines.manage", campusId) : false;
  const now = new Date();
  const live = { fulfilledAt: null, cancelledAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };

  const [items, categories, loans, reservations, fines] = campusId
    ? await Promise.all([
        prisma.libraryItem.findMany({
          where: { tenantId: ctx.tenantId!, campusId, ...(q ? { title: { contains: q, mode: "insensitive" } } : {}) },
          include: { author: true, category: true, copies: { orderBy: { barcode: "asc" } }, reservations: { where: live } },
          orderBy: { title: "asc" },
          take: 100,
        }),
        prisma.libraryCategory.findMany({ where: { tenantId: ctx.tenantId!, campusId }, orderBy: { name: "asc" } }),
        prisma.libraryCirculation.findMany({
          where: { tenantId: ctx.tenantId!, campusId, type: "ISSUE", returnedAt: null, ...(canCirculate ? {} : { borrowerUserId: ctx.user.id }) },
          include: { copy: { include: { item: true } }, borrower: { select: { email: true, displayName: true } } },
          orderBy: { dueDate: "asc" },
          take: 100,
        }),
        prisma.libraryReservation.findMany({
          where: { tenantId: ctx.tenantId!, campusId, ...live, ...(canCirculate ? {} : { reservedByUserId: ctx.user.id }) },
          include: { item: true, reservedBy: { select: { email: true, displayName: true } } },
          orderBy: { createdAt: "asc" },
          take: 100,
        }),
        canFines
          ? prisma.libraryCirculation.findMany({ where: { tenantId: ctx.tenantId!, campusId, fineAmount: { gt: 0 }, finePaid: false }, include: { copy: { include: { item: true } }, borrower: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 50 })
          : Promise.resolve([]),
      ])
    : [[], [], [], [], []];
  const th = "pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]";

  return (
    <div className="space-y-8">
      <PageHeader title="Library" subtitle="Catalog, loans, reservations and fines" />
      <div className="flex flex-wrap gap-2">
        {accessible.map((c) => (
          <Link key={c.id} href={`?campusId=${c.id}`} className={`rounded-full px-3 py-1 text-sm font-medium ${c.id === campusId ? "bg-brand-600 text-white" : "bg-white ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50"}`}>{c.name}</Link>
        ))}
      </div>

      {canCirculate && campusId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Issue a book</h3>
            <ActionForm action={issueBook} submit="Issue" pendingLabel="Issuing…" className="grid gap-3 sm:grid-cols-2">
              <label><span className={labelCls}>Copy barcode</span><input name="barcode" required placeholder="Scan or type" className={inputCls} /></label>
              <label><span className={labelCls}>Borrower email</span><input name="borrowerEmail" type="email" required className={inputCls} /></label>
              <label><span className={labelCls}>Loan period</span><select name="dueDays" defaultValue="14" className={inputCls}>{LOAN_DAYS.map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
            </ActionForm>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Return a book</h3>
            <ActionForm action={returnBook} submit="Return" pendingLabel="Returning…" className="grid gap-3 sm:grid-cols-2">
              <label><span className={labelCls}>Copy barcode</span><input name="barcode" required placeholder="Scan or type" className={inputCls} /></label>
              <label><span className={labelCls}>Condition</span><select name="condition" className={inputCls}><option value="GOOD">Good</option><option value="DAMAGED">Damaged</option></select></label>
            </ActionForm>
          </Card>
        </div>
      )}

      {canCatalog && campusId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Add a book</h3>
            {categories.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">Create a category first.</p> : (
              <ActionForm action={addBook} submit="Add book" pendingLabel="Adding…" className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="campusId" value={campusId} />
                <label className="sm:col-span-2"><span className={labelCls}>Title</span><input name="title" required maxLength={200} className={inputCls} /></label>
                <label><span className={labelCls}>Author</span><input name="authorName" maxLength={120} className={inputCls} /></label>
                <label><span className={labelCls}>Category</span><select name="categoryId" required className={inputCls}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label><span className={labelCls}>ISBN</span><input name="isbn" className={inputCls} /></label>
                <label><span className={labelCls}>Copies</span><input name="copies" type="number" min={1} max={50} defaultValue={1} className={inputCls} /></label>
              </ActionForm>
            )}
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-semibold">Add a category</h3>
            <ActionForm action={createLibraryCategory} submit="Add category" variant="ghost" className="flex items-end gap-2">
              <input type="hidden" name="campusId" value={campusId} />
              <input name="name" required maxLength={60} placeholder="e.g. Fiction" className={inputCls} />
            </ActionForm>
          </Card>
        </div>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Catalog ({items.length})</h2>
          <form className="flex gap-2">
            <input type="hidden" name="campusId" value={campusId ?? ""} />
            <input name="q" defaultValue={q} placeholder="Search by title…" className={`${inputCls} w-56`} />
            <button className="rounded-lg bg-white px-3 py-2 text-sm font-medium ring-1 ring-inset ring-[color:var(--color-line)] hover:bg-slate-50">Search</button>
          </form>
        </div>
        <Card className="overflow-x-auto">
          {items.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No books found.</p> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Title</th><th className={th}>Author</th><th className={th}>Category</th><th className={`${th} text-center`}>Available</th>{canCirculate && <th className={th}>Barcodes</th>}<th /></tr></thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {items.map((it) => {
                  const avail = it.copies.filter((c) => c.status === "AVAILABLE").length;
                  const queued = it.reservations.length;
                  const mineReserved = it.reservations.some((r) => r.reservedByUserId === ctx.user.id);
                  return (
                    <tr key={it.id}>
                      <td className="py-2 pr-4 font-medium">{it.title}</td>
                      <td className="py-2 pr-4">{it.author?.name ?? "—"}</td>
                      <td className="py-2 pr-4">{it.category.name}</td>
                      <td className="py-2 pr-4 text-center"><span className={avail > 0 ? "text-emerald-700" : "text-red-600"}>{avail}/{it.copies.length}</span>{queued > 0 && <span className="ml-1 text-xs text-[color:var(--color-muted)]">· {queued} waiting</span>}</td>
                      {canCirculate && <td className="py-2 pr-4 font-mono text-xs">{it.copies.map((c) => `${c.barcode}${c.status !== "AVAILABLE" ? ` (${c.status.toLowerCase()})` : ""}`).join(", ")}</td>}
                      <td className="py-2 text-right">
                        {!mineReserved && (avail === 0 || queued > 0) && it.copies.length > 0 && (
                          <ActionForm action={reserveBook} submit="Reserve" variant="ghost"><input type="hidden" name="itemId" value={it.id} /></ActionForm>
                        )}
                        {mineReserved && <Badge tone="sky">Reserved by you</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{canCirculate ? "Active loans" : "My loans"} ({loans.length})</h2>
        <Card className="overflow-x-auto">
          {loans.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No books on loan.</p> : (
            <table className="w-full text-sm">
              <thead><tr><th className={th}>Title</th>{canCirculate && <th className={th}>Borrower</th>}<th className={th}>Due</th><th className={th}>Status</th><th /></tr></thead>
              <tbody className="divide-y divide-[color:var(--color-line)]">
                {loans.map((l) => {
                  const overdue = !!l.dueDate && now > l.dueDate;
                  return (
                    <tr key={l.id}>
                      <td className="py-2 pr-4">{l.copy.item.title}</td>
                      {canCirculate && <td className="py-2 pr-4">{l.borrower.displayName ?? l.borrower.email}</td>}
                      <td className="py-2 pr-4 whitespace-nowrap">{l.dueDate?.toLocaleDateString() ?? "—"}</td>
                      <td className="py-2 pr-4"><Badge tone={overdue ? "red" : "green"}>{overdue ? "Overdue" : "On loan"}</Badge>{l.renewCount > 0 && <span className="ml-2 text-xs text-[color:var(--color-muted)]">renewed {l.renewCount}/{MAX_RENEWALS}</span>}</td>
                      <td className="py-2 text-right">{!overdue && l.renewCount < MAX_RENEWALS && <ActionForm action={renewLoan} submit="Renew" variant="ghost"><input type="hidden" name="loanId" value={l.id} /></ActionForm>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{canCirculate ? "Reservations" : "My reservations"} ({reservations.length})</h2>
        <Card>
          {reservations.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">None.</p> : (
            <ul className="divide-y divide-[color:var(--color-line)] text-sm">
              {reservations.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <span>{r.item.title}{canCirculate && <> — {r.reservedBy.displayName ?? r.reservedBy.email}</>} <span className="text-xs text-[color:var(--color-muted)]">holds until {r.expiresAt?.toLocaleDateString() ?? "—"}</span></span>
                  <ActionForm action={cancelReservation} submit="Cancel" variant="ghost"><input type="hidden" name="reservationId" value={r.id} /></ActionForm>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {canFines && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Unpaid fines ({fines.length})</h2>
          <Card>
            {fines.length === 0 ? <p className="text-sm text-[color:var(--color-muted)]">No unpaid fines.</p> : (
              <ul className="divide-y divide-[color:var(--color-line)] text-sm">
                {fines.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{l.borrower.email} · {l.copy.item.title} · <b>{formatMoney(l.fineAmount)}</b></span>
                    <span className="flex items-center gap-2">
                      <ActionForm action={settleFine} submit="Mark paid" variant="ghost"><input type="hidden" name="loanId" value={l.id} /><input type="hidden" name="how" value="PAID" /></ActionForm>
                      <ActionForm action={settleFine} submit="Waive" variant="ghost" className="flex items-center gap-2"><input type="hidden" name="loanId" value={l.id} /><input type="hidden" name="how" value="WAIVE" /><input name="reason" required minLength={5} placeholder="Reason" className={inputCls} /></ActionForm>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
