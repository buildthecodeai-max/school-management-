"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { MAX_ACTIVE_LOANS, RESERVATION_DAYS, addDays, checkRenewal, isLoanDays, lateFee } from "@/lib/library";
import { formatMoney } from "@/lib/money";

export interface LibraryActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

class Blocked extends Error {}
const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const activeReservation = (now: Date) => ({ fulfilledAt: null, cancelledAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

async function copyByBarcode(tenantId: string, barcode: string) {
  return prisma.libraryCopy.findFirst({ where: { tenantId, barcode }, include: { item: true } });
}

// ---- catalog ---------------------------------------------------------------

export async function createLibraryCategory(_p: LibraryActionState, f: FormData): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId", 40);
  if (!canForCampus(ctx, "library.catalog.write", campusId)) return { error: "Permission denied." };
  if (!(await prisma.campus.findFirst({ where: { id: campusId, tenantId: ctx.tenantId! }, select: { id: true } }))) return { error: "Campus not found." };
  const name = text(f, "name", 60);
  if (!name) return { error: "Enter a category name." };
  if (await prisma.libraryCategory.findFirst({ where: { tenantId: ctx.tenantId!, campusId, name } })) return { error: `Category "${name}" already exists.` };
  const c = await prisma.libraryCategory.create({ data: { tenantId: ctx.tenantId!, campusId, name } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.category.created", targetType: "LibraryCategory", targetId: c.id, campusId, metadata: { name } });
  revalidatePath("/portal/library");
  return { ok: true, message: `Category "${name}" added.` };
}

export async function addBook(_p: LibraryActionState, f: FormData): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId", 40);
  if (!canForCampus(ctx, "library.catalog.write", campusId)) return { error: "Permission denied." };
  const title = text(f, "title", 200);
  if (!title) return { error: "Title is required." };
  const category = await prisma.libraryCategory.findFirst({ where: { id: text(f, "categoryId", 40), tenantId: ctx.tenantId!, campusId }, select: { id: true } });
  if (!category) return { error: "Choose a category from this campus." };
  const copies = Number(f.get("copies") ?? 1);
  if (!Number.isInteger(copies) || copies < 1 || copies > 50) return { error: "Copies must be a whole number from 1 to 50." };
  const isbn = text(f, "isbn", 20).replace(/[\s-]/g, "");
  if (isbn && !/^(\d{9}[\dXx]|\d{13})$/.test(isbn)) return { error: "ISBN must be 10 or 13 digits." };
  const authorName = text(f, "authorName", 120);

  const item = await prisma.$transaction(async (tx) => {
    let authorId: string | null = null;
    if (authorName) {
      const a = (await tx.libraryAuthor.findFirst({ where: { tenantId: ctx.tenantId!, name: authorName } })) ?? (await tx.libraryAuthor.create({ data: { tenantId: ctx.tenantId!, name: authorName } }));
      authorId = a.id;
    }
    const it = await tx.libraryItem.create({ data: { tenantId: ctx.tenantId!, campusId, categoryId: category.id, authorId, title, isbn: isbn || null } });
    const base = `${campusId.slice(-4).toUpperCase()}-${it.id.slice(-6).toUpperCase()}`;
    await tx.libraryCopy.createMany({ data: Array.from({ length: copies }, (_, i) => ({ tenantId: ctx.tenantId!, itemId: it.id, barcode: `${base}-${String(i + 1).padStart(2, "0")}`, status: "AVAILABLE" as const })) });
    return it;
  });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.book.added", targetType: "LibraryItem", targetId: item.id, campusId, metadata: { title, copies } });
  revalidatePath("/portal/library");
  return { ok: true, message: `"${title}" added with ${copies} cop${copies === 1 ? "y" : "ies"}. Barcodes are shown in the catalog.` };
}

// ---- circulation -------------------------------------------------------------

export async function issueBook(_p: LibraryActionState, f: FormData): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const copy = await copyByBarcode(ctx.tenantId!, text(f, "barcode", 60));
  if (!copy) return { error: "No copy with that barcode." };
  const campusId = copy.item.campusId; // from the book, never from the form
  if (!canForCampus(ctx, "library.circulate", campusId)) return { error: "Permission denied." };
  const days = Number(f.get("dueDays") ?? 14);
  if (!isLoanDays(days)) return { error: "Choose a loan period from the list." };
  const email = text(f, "borrowerEmail", 120).toLowerCase();
  const borrower = await prisma.user.findFirst({ where: { tenantId: ctx.tenantId!, email: { equals: email, mode: "insensitive" } }, select: { id: true, email: true } });
  if (!borrower) return { error: "No user with that email in this school." };

  const now = new Date();
  const dueDate = addDays(now, days);
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.libraryCopy.updateMany({ where: { id: copy.id, status: "AVAILABLE" }, data: { status: "ISSUED" } });
      if (claimed.count === 0) throw new Blocked(`This copy is not available (${copy.status.toLowerCase()}).`);
      const open = await tx.libraryCirculation.count({ where: { tenantId: ctx.tenantId!, borrowerUserId: borrower.id, type: "ISSUE", returnedAt: null } });
      if (open >= MAX_ACTIVE_LOANS) throw new Blocked(`${borrower.email} already has ${MAX_ACTIVE_LOANS} books out.`);

      // Queue: copies are held for people who reserved the title first.
      const queue = await tx.libraryReservation.findMany({ where: { tenantId: ctx.tenantId!, itemId: copy.itemId, ...activeReservation(now) }, orderBy: { createdAt: "asc" } });
      const mine = queue.find((r) => r.reservedByUserId === borrower.id);
      if (queue.length > 0 && !mine) {
        const availableNow = (await tx.libraryCopy.count({ where: { itemId: copy.itemId, status: "AVAILABLE" } })) + 1; // + the copy claimed above
        if (queue.length >= availableNow) throw new Blocked("Every available copy of this title is held for people who reserved it.");
      }
      if (mine) await tx.libraryReservation.update({ where: { id: mine.id }, data: { fulfilledAt: now } });
      await tx.libraryCirculation.create({ data: { tenantId: ctx.tenantId!, campusId, copyId: copy.id, borrowerUserId: borrower.id, type: "ISSUE", dueDate } });
    });
  } catch (e) {
    if (e instanceof Blocked) return { error: e.message };
    throw e;
  }
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.issue", targetType: "LibraryCopy", targetId: copy.id, campusId, metadata: { borrowerUserId: borrower.id, dueDate } });
  revalidatePath("/portal/library");
  return { ok: true, message: `"${copy.item.title}" issued to ${borrower.email}, due ${dueDate.toLocaleDateString()}.` };
}

export async function returnBook(_p: LibraryActionState, f: FormData): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const copy = await copyByBarcode(ctx.tenantId!, text(f, "barcode", 60));
  if (!copy) return { error: "No copy with that barcode." };
  const campusId = copy.item.campusId;
  if (!canForCampus(ctx, "library.circulate", campusId)) return { error: "Permission denied." };
  const damaged = text(f, "condition", 10) === "DAMAGED";
  const loan = await prisma.libraryCirculation.findFirst({ where: { copyId: copy.id, tenantId: ctx.tenantId!, type: "ISSUE", returnedAt: null } });
  if (!loan) return { error: "This copy is not on loan." };

  const now = new Date();
  const fine = lateFee(loan.dueDate, now);
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.libraryCirculation.updateMany({ where: { id: loan.id, returnedAt: null }, data: { type: "RETURN", returnedAt: now, fineAmount: fine } });
    if (claimed.count === 0) return false;
    await tx.libraryCopy.update({ where: { id: copy.id }, data: { status: damaged ? "DAMAGED" : "AVAILABLE" } });
    return true;
  });
  if (!done) return { error: "This copy was already returned." };

  if (fine > 0) {
    await notify({ tenantId: ctx.tenantId!, recipientUserId: loan.borrowerUserId, category: "FINANCE", title: "Library fine applied", body: `A late-return fine of ${formatMoney(fine)} was applied for "${copy.item.title}". Please settle it at the library desk.`, dedupeKey: `library:fine:${loan.id}` });
  }
  // Tell the first person in the queue that a copy is ready.
  if (!damaged) {
    const next = await prisma.libraryReservation.findFirst({ where: { tenantId: ctx.tenantId!, itemId: copy.itemId, ...activeReservation(now) }, orderBy: { createdAt: "asc" } });
    if (next) await notify({ tenantId: ctx.tenantId!, recipientUserId: next.reservedByUserId, category: "ACADEMICS", title: "Your reserved book is ready", body: `"${copy.item.title}" is available. Collect it from the library.`, relatedType: "library", relatedId: copy.itemId, dedupeKey: `library:ready:${next.id}:${loan.id}` });
  }
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.return", targetType: "LibraryCopy", targetId: copy.id, campusId, metadata: { fineAmount: fine, damaged } });
  revalidatePath("/portal/library");
  return { ok: true, message: `Returned.${fine > 0 ? ` Late fine ${formatMoney(fine)} applied.` : ""}${damaged ? " Copy marked damaged." : ""}` };
}

export async function renewLoan(_p: LibraryActionState, f: FormData): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const loan = await prisma.libraryCirculation.findFirst({ where: { id: text(f, "loanId", 40), tenantId: ctx.tenantId!, type: "ISSUE", returnedAt: null }, include: { copy: { include: { item: true } } } });
  if (!loan) return { error: "Loan not found." };
  const campusId = loan.copy.item.campusId;
  const isBorrower = loan.borrowerUserId === ctx.user.id && canForCampus(ctx, "library.read", campusId);
  if (!isBorrower && !canForCampus(ctx, "library.circulate", campusId)) return { error: "Permission denied." };
  const now = new Date();
  const waiting = await prisma.libraryReservation.count({ where: { tenantId: ctx.tenantId!, itemId: loan.copy.itemId, reservedByUserId: { not: loan.borrowerUserId }, ...activeReservation(now) } });
  const check = checkRenewal(loan, now, waiting);
  if (!check.ok) return { error: check.error };
  const newDue = addDays(loan.dueDate && loan.dueDate > now ? loan.dueDate : now, 14);
  const moved = await prisma.libraryCirculation.updateMany({ where: { id: loan.id, returnedAt: null, renewCount: loan.renewCount }, data: { dueDate: newDue, renewCount: { increment: 1 } } });
  if (moved.count === 0) return { error: "This loan just changed. Refresh and try again." };
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.renew", targetType: "LibraryCirculation", targetId: loan.id, campusId, metadata: { newDue, renewCount: loan.renewCount + 1 } });
  revalidatePath("/portal/library");
  return { ok: true, message: `Renewed until ${newDue.toLocaleDateString()}.` };
}

// ---- reservations ------------------------------------------------------------

export async function reserveBook(_p: LibraryActionState, f: FormData): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const item = await prisma.libraryItem.findFirst({ where: { id: text(f, "itemId", 40), tenantId: ctx.tenantId! }, include: { copies: true } });
  if (!item) return { error: "Book not found." };
  if (!canForCampus(ctx, "library.read", item.campusId)) return { error: "Permission denied." };
  const now = new Date();
  if (item.copies.length === 0) return { error: "This title has no copies." };
  if (item.copies.some((c) => c.status === "AVAILABLE") && !(await prisma.libraryReservation.count({ where: { tenantId: ctx.tenantId!, itemId: item.id, ...activeReservation(now) } })))
    return { error: "A copy is available now. Ask at the library desk." };
  const holding = await prisma.libraryCirculation.count({ where: { tenantId: ctx.tenantId!, borrowerUserId: ctx.user.id, type: "ISSUE", returnedAt: null, copy: { itemId: item.id } } });
  if (holding > 0) return { error: "You already have this book out." };
  if (await prisma.libraryReservation.findFirst({ where: { tenantId: ctx.tenantId!, itemId: item.id, reservedByUserId: ctx.user.id, ...activeReservation(now) } }))
    return { error: "You already have an active reservation for this title." };
  const r = await prisma.libraryReservation.create({ data: { tenantId: ctx.tenantId!, campusId: item.campusId, itemId: item.id, reservedByUserId: ctx.user.id, expiresAt: addDays(now, RESERVATION_DAYS) } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.reserved", targetType: "LibraryReservation", targetId: r.id, campusId: item.campusId, metadata: { itemId: item.id } });
  revalidatePath("/portal/library");
  return { ok: true, message: `Reserved. You are notified when a copy is ready; the hold lasts ${RESERVATION_DAYS} days.` };
}

export async function cancelReservation(_p: LibraryActionState, f: FormData): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const r = await prisma.libraryReservation.findFirst({ where: { id: text(f, "reservationId", 40), tenantId: ctx.tenantId!, fulfilledAt: null, cancelledAt: null } });
  if (!r) return { error: "Reservation not found." };
  // Only the person who reserved, or a librarian on the book's campus, may cancel.
  if (r.reservedByUserId !== ctx.user.id && !canForCampus(ctx, "library.circulate", r.campusId)) return { error: "Permission denied." };
  await prisma.libraryReservation.update({ where: { id: r.id }, data: { cancelledAt: new Date() } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.reservation.cancelled", targetType: "LibraryReservation", targetId: r.id, campusId: r.campusId });
  revalidatePath("/portal/library");
  return { ok: true, message: "Reservation cancelled." };
}

// ---- fines -------------------------------------------------------------------

export async function settleFine(_p: LibraryActionState, f: FormData): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const loan = await prisma.libraryCirculation.findFirst({ where: { id: text(f, "loanId", 40), tenantId: ctx.tenantId!, fineAmount: { gt: 0 }, finePaid: false } });
  if (!loan) return { error: "No unpaid fine on that loan." };
  if (!canForCampus(ctx, "library.fines.manage", loan.campusId)) return { error: "Permission denied." };
  const how = text(f, "how", 10);
  if (how === "PAID") {
    await prisma.libraryCirculation.update({ where: { id: loan.id }, data: { finePaid: true } });
  } else if (how === "WAIVE") {
    const reason = text(f, "reason", 200);
    if (reason.length < 5) return { error: "Give a reason for waiving the fine." };
    await prisma.libraryCirculation.update({ where: { id: loan.id }, data: { fineAmount: 0 } });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.fine.waived", targetType: "LibraryCirculation", targetId: loan.id, campusId: loan.campusId, metadata: { amount: loan.fineAmount, reason } });
    revalidatePath("/portal/library");
    return { ok: true, message: `Fine of ${formatMoney(loan.fineAmount)} waived.` };
  } else return { error: "Choose paid or waive." };
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "library.fine.paid", targetType: "LibraryCirculation", targetId: loan.id, campusId: loan.campusId, metadata: { amount: loan.fineAmount } });
  revalidatePath("/portal/library");
  return { ok: true, message: `Fine of ${formatMoney(loan.fineAmount)} recorded as paid.` };
}
