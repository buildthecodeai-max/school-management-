"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export interface LibraryActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

// Issue a copy to a user.
export async function issueBook(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  const copyId = String(formData.get("copyId") ?? "");
  const borrowerUserId = String(formData.get("borrowerUserId") ?? "");
  const dueDays = Number(formData.get("dueDays") ?? 14);
  if (!canForCampus(ctx, "library.circulate", campusId)) return { error: "Permission denied." };

  const copy = await prisma.libraryCopy.findFirst({
    where: { id: copyId, tenantId: ctx.tenantId! },
  });
  if (!copy) return { error: "Copy not found." };
  if (copy.status !== "AVAILABLE") return { error: "This copy is not available." };

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);

  await prisma.$transaction(async (tx) => {
    await tx.libraryCopy.update({ where: { id: copyId }, data: { status: "ISSUED" } });
    await tx.libraryCirculation.create({
      data: {
        tenantId: ctx.tenantId!,
        campusId,
        copyId,
        borrowerUserId,
        type: "ISSUE",
        dueDate,
      },
    });
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "library.issue",
    targetType: "LibraryCopy",
    targetId: copyId,
    campusId,
    metadata: { borrowerUserId, dueDate },
  });

  revalidatePath("/portal/library");
  return { ok: true, message: "Book issued." };
}

// Return a copy.
export async function returnBook(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  const copyId = String(formData.get("copyId") ?? "");
  if (!canForCampus(ctx, "library.circulate", campusId)) return { error: "Permission denied." };

  const openLoan = await prisma.libraryCirculation.findFirst({
    where: { copyId, tenantId: ctx.tenantId!, type: "ISSUE", returnedAt: null },
  });
  if (!openLoan) return { error: "No open loan found for this copy." };

  const now = new Date();
  const late = openLoan.dueDate && now > openLoan.dueDate;
  const fineAmount = late ? 500 : 0; // 500 cents = $5 flat late fee

  await prisma.$transaction(async (tx) => {
    await tx.libraryCopy.update({ where: { id: copyId }, data: { status: "AVAILABLE" } });
    await tx.libraryCirculation.update({
      where: { id: openLoan.id },
      data: { type: "RETURN", returnedAt: now, fineAmount },
    });
  });

  if (fineAmount > 0) {
    await notify({
      tenantId: ctx.tenantId!,
      recipientUserId: openLoan.borrowerUserId,
      category: "FINANCE",
      title: "Library fine applied",
      body: `A library fine of $5.00 has been applied for a late return. Please pay at the library desk.`,
      dedupeKey: `library:fine:${openLoan.id}`,
    });
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "library.return",
    targetType: "LibraryCopy",
    targetId: copyId,
    campusId,
    metadata: { fineAmount },
  });

  revalidatePath("/portal/library");
  return { ok: true, message: fineAmount > 0 ? "Book returned. Fine of $5.00 applied." : "Book returned." };
}

// LIB-reserve: Reserve a library item (not yet issued — waiting for a copy to become available).
export async function reserveBook(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!campusId || !itemId) return { error: "Missing required fields." };
  if (!canForCampus(ctx, "library.read", campusId)) return { error: "Permission denied." };

  // Check no open reservation already exists for this user + item.
  const existing = await prisma.libraryReservation.findFirst({
    where: {
      tenantId: ctx.tenantId!,
      campusId,
      itemId,
      reservedByUserId: ctx.user.id,
      fulfilledAt: null,
      cancelledAt: null,
    },
  });
  if (existing) return { error: "You already have an active reservation for this item." };

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // reservations expire in 7 days

  await prisma.libraryReservation.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      itemId,
      reservedByUserId: ctx.user.id,
      expiresAt,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "library.reserved",
    targetType: "LibraryItem",
    targetId: itemId,
    campusId,
    metadata: { expiresAt },
  });

  revalidatePath("/portal/library");
  return { ok: true, message: "Reservation created. You will be notified when a copy is available." };
}

// LIB-reserve: Fulfill a reservation — issue the copy and mark the reservation fulfilled.
export async function fulfillReservation(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "");
  const copyId = String(formData.get("copyId") ?? "");
  const dueDays = Number(formData.get("dueDays") ?? 14);
  if (!canForCampus(ctx, "library.circulate", campusId)) return { error: "Permission denied." };

  const reservation = await prisma.libraryReservation.findFirst({
    where: { id: reservationId, tenantId: ctx.tenantId!, campusId, fulfilledAt: null, cancelledAt: null },
  });
  if (!reservation) return { error: "Reservation not found or already fulfilled." };

  const copy = await prisma.libraryCopy.findFirst({
    where: { id: copyId, tenantId: ctx.tenantId!, status: "AVAILABLE" },
  });
  if (!copy) return { error: "Copy is not available." };

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + dueDays);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.libraryCopy.update({ where: { id: copyId }, data: { status: "ISSUED" } });
    await tx.libraryCirculation.create({
      data: {
        tenantId: ctx.tenantId!,
        campusId,
        copyId,
        borrowerUserId: reservation.reservedByUserId,
        type: "ISSUE",
        dueDate,
      },
    });
    await tx.libraryReservation.update({
      where: { id: reservationId },
      data: { fulfilledAt: now },
    });
  });

  await notify({
    tenantId: ctx.tenantId!,
    recipientUserId: reservation.reservedByUserId,
    category: "ACADEMICS",
    title: "Library reservation fulfilled",
    body: `Your reserved item is now issued to you. Please return it by ${dueDate.toDateString()}.`,
    dedupeKey: `library:fulfill:${reservationId}`,
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "library.reservation.fulfilled",
    targetType: "LibraryReservation",
    targetId: reservationId,
    campusId,
    metadata: { copyId, borrowerUserId: reservation.reservedByUserId },
  });

  revalidatePath("/portal/library");
  return { ok: true, message: "Reservation fulfilled and book issued." };
}

// LIB-reserve: Cancel a reservation.
export async function cancelReservation(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  const reservationId = String(formData.get("reservationId") ?? "");
  if (!campusId || !reservationId) return { error: "Missing required fields." };

  const reservation = await prisma.libraryReservation.findFirst({
    where: { id: reservationId, tenantId: ctx.tenantId!, fulfilledAt: null, cancelledAt: null },
  });
  if (!reservation) return { error: "Reservation not found." };

  // Only the reserver or a librarian may cancel.
  const isOwner = reservation.reservedByUserId === ctx.user.id;
  const isLibrarian = canForCampus(ctx, "library.circulate", campusId);
  if (!isOwner && !isLibrarian) return { error: "Permission denied." };

  await prisma.libraryReservation.update({
    where: { id: reservationId },
    data: { cancelledAt: new Date() },
  });

  revalidatePath("/portal/library");
  return { ok: true, message: "Reservation cancelled." };
}

// Add a new book (title + copies) to the catalog.
export async function addBook(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  if (!canForCampus(ctx, "library.circulate", campusId)) return { error: "Permission denied." };

  const title = String(formData.get("title") ?? "").trim();
  const authorName = String(formData.get("authorName") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "");
  const isbn = String(formData.get("isbn") ?? "").trim();
  const copies = parseInt(String(formData.get("copies") ?? "1"), 10);

  if (!title) return { error: "Title is required." };
  if (!categoryId) return { error: "Category is required." };

  let authorId: string | undefined;
  if (authorName) {
    const existing = await prisma.libraryAuthor.findFirst({
      where: { tenantId: ctx.tenantId!, name: authorName },
    });
    const author = existing ?? await prisma.libraryAuthor.create({
      data: { tenantId: ctx.tenantId!, name: authorName },
    });
    authorId = author.id;
  }

  const item = await prisma.libraryItem.create({
    data: {
      tenantId: ctx.tenantId!,
      campusId,
      categoryId,
      authorId,
      title,
      isbn: isbn || null,
    },
  });

  const barcodeBase = `${campusId.slice(-4).toUpperCase()}-${item.id.slice(-6).toUpperCase()}`;
  for (let i = 0; i < Math.min(copies, 10); i++) {
    await prisma.libraryCopy.create({
      data: {
        tenantId: ctx.tenantId!,
        itemId: item.id,
        barcode: `${barcodeBase}-${String(i + 1).padStart(2, "0")}`,
        status: "AVAILABLE",
      },
    });
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "library.book.added",
    targetType: "LibraryItem",
    targetId: item.id,
    campusId,
    metadata: { title, copies },
  });

  revalidatePath("/portal/library");
  return { ok: true, message: `"${title}" added with ${copies} cop${copies === 1 ? "y" : "ies"}.` };
}

// Return a book by barcode.
export async function returnBookByBarcode(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const ctx = await requireUser();
  const campusId = String(formData.get("campusId") ?? "");
  const barcode = String(formData.get("barcode") ?? "").trim();
  if (!canForCampus(ctx, "library.circulate", campusId)) return { error: "Permission denied." };

  const copy = await prisma.libraryCopy.findFirst({
    where: { tenantId: ctx.tenantId!, barcode },
  });
  if (!copy) return { error: `No copy found with barcode "${barcode}".` };

  const fakeForm = new FormData();
  fakeForm.set("campusId", campusId);
  fakeForm.set("copyId", copy.id);
  return returnBook(_prev, fakeForm);
}
