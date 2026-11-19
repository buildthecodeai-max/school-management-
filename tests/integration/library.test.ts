import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { addBook, createLibraryCategory, issueBook, returnBook, renewLoan, reserveBook, cancelReservation, settleFine } from "@/app/portal/library/actions";
import { prisma, makeTenant, makeCampus, makeUser, authContextFor, cleanupAll } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const READ = ["library.read"];
const STAFF = ["library.read", "library.catalog.write", "library.circulate", "library.fines.manage"];

describe("library circulation", () => {
  let tenantId: string, campusId: string, otherCampus: string, categoryId: string;
  let librarian: unknown, otherLibrarian: unknown, reader1: unknown, reader2: unknown;
  let r1: { id: string; email: string }, r2: { id: string; email: string }, foreignEmail: string;
  let itemId: string, barcodes: string[];

  const mk = async (perms: string[], campus = campusId) => { const u = await makeUser({ tenantId, permissions: perms, scope: "CAMPUS", campusId: campus }); return { u, ctx: await authContextFor(u.id) }; };
  const issue = (barcode: string, email: string, o: Record<string, string> = {}) => issueBook({}, fd({ barcode, borrowerEmail: email, dueDays: "14", ...o }));
  const loanOf = (barcode: string) => prisma.libraryCirculation.findFirstOrThrow({ where: { tenantId, copy: { barcode }, returnedAt: null } });

  beforeAll(async () => {
    tenantId = (await makeTenant("Lib Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    librarian = (await mk(STAFF)).ctx;
    otherLibrarian = (await mk(STAFF, otherCampus)).ctx;
    const a = await mk(READ), b = await mk(READ);
    reader1 = a.ctx; reader2 = b.ctx; r1 = { id: a.u.id, email: a.u.email }; r2 = { id: b.u.id, email: b.u.email };
    const t2 = (await makeTenant("Other Lib Org")).id;
    foreignEmail = (await makeUser({ tenantId: t2, permissions: [], scope: "ORG" })).email;
  });
  afterAll(cleanupAll);

  it("builds the catalog with permission and validation", async () => {
    current = reader1;
    expect((await createLibraryCategory({}, fd({ campusId, name: "Fiction" }))).error).toMatch(/permission/i);
    current = otherLibrarian;
    expect((await createLibraryCategory({}, fd({ campusId, name: "Fiction" }))).error).toMatch(/permission/i);
    current = librarian;
    expect((await createLibraryCategory({}, fd({ campusId, name: "Fiction" }))).ok).toBe(true);
    expect((await createLibraryCategory({}, fd({ campusId, name: "Fiction" }))).error).toMatch(/already exists/i);
    categoryId = (await prisma.libraryCategory.findFirstOrThrow({ where: { tenantId } })).id;
    expect((await addBook({}, fd({ campusId, title: "Dune", categoryId: "nope" }))).error).toMatch(/category/i);
    expect((await addBook({}, fd({ campusId, title: "Dune", categoryId, copies: "51" }))).error).toMatch(/1 to 50/);
    expect((await addBook({}, fd({ campusId, title: "Dune", categoryId, copies: "2", isbn: "12" }))).error).toMatch(/ISBN/);
    expect((await addBook({}, fd({ campusId, title: "Dune", categoryId, copies: "2", isbn: "978-0-441-17271-9", authorName: "Frank Herbert" }))).ok).toBe(true);
    const item = await prisma.libraryItem.findFirstOrThrow({ where: { tenantId }, include: { copies: true } });
    itemId = item.id;
    barcodes = item.copies.map((c) => c.barcode).sort();
    expect(barcodes).toHaveLength(2);
  });

  it("issues only with rights on the book's campus, to people in this school, once per copy", async () => {
    current = reader1;
    expect((await issue(barcodes[0], r1.email)).error).toMatch(/permission/i);
    current = otherLibrarian;
    expect((await issue(barcodes[0], r1.email)).error).toMatch(/permission/i);
    current = librarian;
    expect((await issue("nope", r1.email)).error).toMatch(/no copy/i);
    expect((await issue(barcodes[0], foreignEmail)).error).toMatch(/no user/i);
    expect((await issue(barcodes[0], r1.email, { dueDays: "365" })).error).toMatch(/loan period/i);
    const results = await Promise.all([1, 2, 3].map(() => issue(barcodes[0], r1.email)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await prisma.libraryCopy.findFirstOrThrow({ where: { barcode: barcodes[0] } })).status).toBe("ISSUED");
    expect(await prisma.libraryCirculation.count({ where: { tenantId } })).toBe(1);
  });

  it("queues reservations: not while a copy is free, no duplicates, copies are held for the queue", async () => {
    current = reader2;
    expect((await reserveBook({}, fd({ itemId }))).error).toMatch(/available now/i);
    current = librarian;
    expect((await issue(barcodes[1], r1.email)).ok).toBe(true); // all copies out now
    current = reader2;
    expect((await reserveBook({}, fd({ itemId }))).ok).toBe(true);
    expect((await reserveBook({}, fd({ itemId }))).error).toMatch(/already have an active/i);
    current = reader1;
    expect((await reserveBook({}, fd({ itemId }))).error).toMatch(/already have this book out/i);
  });

  it("returns with a per-day fine, notifies the queue, and lets only the reserver take the copy", async () => {
    current = librarian;
    const old = await loanOf(barcodes[0]);
    await prisma.libraryCirculation.update({ where: { id: old.id }, data: { dueDate: new Date(Date.now() - 4.5 * 86_400_000) } });
    expect((await returnBook({}, fd({ barcode: "nope" }))).error).toMatch(/no copy/i);
    const r = await returnBook({}, fd({ barcode: barcodes[0] }));
    expect(r.ok).toBe(true);
    const closed = await prisma.libraryCirculation.findUniqueOrThrow({ where: { id: old.id } });
    expect(closed).toMatchObject({ type: "RETURN", fineAmount: 100 }); // 4 full days x 25c
    expect((await returnBook({}, fd({ barcode: barcodes[0] }))).error).toMatch(/not on loan/i);
    const note = await prisma.message.findMany({ where: { tenantId, title: "Your reserved book is ready" } });
    expect(note.map((m) => m.recipientUserId)).toEqual([r2.id]);
    expect(await prisma.message.count({ where: { tenantId, recipientUserId: r1.id, title: "Library fine applied" } })).toBe(1);

    // a third person cannot take the held copy; the reserver can, which fulfils the reservation
    const r3 = await mk(READ);
    expect((await issue(barcodes[0], r3.u.email)).error).toMatch(/held for people who reserved/i);
    expect((await issue(barcodes[0], r2.email)).ok).toBe(true);
    expect((await prisma.libraryReservation.findFirstOrThrow({ where: { tenantId } })).fulfilledAt).not.toBeNull();
  });

  it("marks damaged returns and keeps those copies off the shelf", async () => {
    current = librarian;
    expect((await returnBook({}, fd({ barcode: barcodes[1], condition: "DAMAGED" }))).ok).toBe(true);
    expect((await prisma.libraryCopy.findFirstOrThrow({ where: { barcode: barcodes[1] } })).status).toBe("DAMAGED");
    expect((await issue(barcodes[1], r1.email)).error).toMatch(/not available.*damaged/i);
  });

  it("renews within limits: owner or librarian only, not overdue, not past the cap, not when others wait", async () => {
    current = librarian;
    await prisma.libraryCopy.updateMany({ where: { barcode: barcodes[1] }, data: { status: "AVAILABLE" } });
    expect((await issue(barcodes[1], r1.email)).ok).toBe(true);
    const loan = await loanOf(barcodes[1]);
    current = reader2;
    expect((await renewLoan({}, fd({ loanId: loan.id }))).error).toMatch(/permission/i);
    current = reader1;
    expect((await renewLoan({}, fd({ loanId: loan.id }))).ok).toBe(true);
    expect((await renewLoan({}, fd({ loanId: loan.id }))).ok).toBe(true);
    expect((await renewLoan({}, fd({ loanId: loan.id }))).error).toMatch(/already been renewed 2 times/i);
    expect((await prisma.libraryCirculation.findUniqueOrThrow({ where: { id: loan.id } })).renewCount).toBe(2);

    // overdue loan, and a loan with a waiting reserver
    const fresh = await mk(READ);
    current = librarian;
    await prisma.libraryCopy.updateMany({ where: { barcode: barcodes[0] }, data: { status: "AVAILABLE" } });
    await prisma.libraryCirculation.updateMany({ where: { copy: { barcode: barcodes[0] }, returnedAt: null }, data: { returnedAt: new Date(), type: "RETURN" } });
    expect((await issue(barcodes[0], fresh.u.email)).ok).toBe(true);
    const l2 = await loanOf(barcodes[0]);
    await prisma.libraryCirculation.update({ where: { id: l2.id }, data: { dueDate: new Date(Date.now() - 86_400_000) } });
    current = fresh.ctx;
    expect((await renewLoan({}, fd({ loanId: l2.id }))).error).toMatch(/overdue/i);
    await prisma.libraryCirculation.update({ where: { id: l2.id }, data: { dueDate: new Date(Date.now() + 5 * 86_400_000) } });
    current = reader2;
    expect((await reserveBook({}, fd({ itemId }))).ok).toBe(true);
    current = fresh.ctx;
    expect((await renewLoan({}, fd({ loanId: l2.id }))).error).toMatch(/waiting/i);
  });

  it("limits active loans per borrower", async () => {
    current = librarian;
    expect((await addBook({}, fd({ campusId, title: "Bulk", categoryId, copies: "6" }))).ok).toBe(true);
    const bulk = await prisma.libraryItem.findFirstOrThrow({ where: { tenantId, title: "Bulk" }, include: { copies: true } });
    const who = await mk(READ);
    const codes = bulk.copies.map((c) => c.barcode);
    for (const c of codes.slice(0, 5)) expect((await issue(c, who.u.email)).ok).toBe(true);
    expect((await issue(codes[5], who.u.email)).error).toMatch(/already has 5 books out/i);
    expect((await prisma.libraryCopy.findFirstOrThrow({ where: { barcode: codes[5] } })).status).toBe("AVAILABLE");
  });

  it("cancels reservations only for the owner or a librarian", async () => {
    const res = await prisma.libraryReservation.findFirstOrThrow({ where: { tenantId, cancelledAt: null, fulfilledAt: null } });
    current = reader1;
    expect((await cancelReservation({}, fd({ reservationId: res.id }))).error).toMatch(/permission/i);
    current = reader2;
    expect((await cancelReservation({}, fd({ reservationId: res.id }))).ok).toBe(true);
    expect((await cancelReservation({}, fd({ reservationId: res.id }))).error).toMatch(/not found/i);
  });

  it("settles fines by paying or waiving with a reason, only with fines rights", async () => {
    const fined = await prisma.libraryCirculation.findFirstOrThrow({ where: { tenantId, fineAmount: { gt: 0 } } });
    current = reader1;
    expect((await settleFine({}, fd({ loanId: fined.id, how: "PAID" }))).error).toMatch(/permission/i);
    current = librarian;
    expect((await settleFine({}, fd({ loanId: fined.id, how: "WAIVE", reason: "no" }))).error).toMatch(/reason/i);
    expect((await settleFine({}, fd({ loanId: fined.id, how: "WAIVE", reason: "Book was reserved late" }))).ok).toBe(true);
    expect((await prisma.libraryCirculation.findUniqueOrThrow({ where: { id: fined.id } })).fineAmount).toBe(0);
    expect((await settleFine({}, fd({ loanId: fined.id, how: "PAID" }))).error).toMatch(/no unpaid fine/i);
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { chainKey: tenantId, action: "library.fine.waived" } });
    expect(JSON.stringify(ev.metadata)).toMatch(/100/);
  });
});
