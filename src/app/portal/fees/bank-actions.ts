"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { MATCH_WINDOW_DAYS, matchLine, parseStatement } from "@/lib/bank-statement";
import { formatMoney } from "@/lib/money";

export interface BankActionState {
  ok?: boolean;
  error?: string;
  message?: string;
}

const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const DAY = 86_400_000;

// Reconciling bank money against receipts needs the right to collect payments on the campus.
async function lineFor(ctx: Awaited<ReturnType<typeof requireUser>>, lineId: string) {
  const line = await prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId: ctx.tenantId! } });
  if (!line) return { error: "Statement line not found." as const };
  if (!canForCampus(ctx, "fee.collect", line.campusId)) return { error: "Permission denied." as const };
  return { line };
}

// FEE-003: import a bank/gateway statement (CSV text read in the browser).
export async function importBankStatement(_p: BankActionState, f: FormData): Promise<BankActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId", 40);
  if (!canForCampus(ctx, "fee.collect", campusId)) return { error: "Permission denied." };
  if (!(await prisma.campus.findFirst({ where: { id: campusId, tenantId: ctx.tenantId! }, select: { id: true } }))) return { error: "Campus not found." };
  const csv = String(f.get("csv") ?? "");
  if (csv.length > 2_000_000) return { error: "The file is too large." };

  const { rows, errors } = parseStatement(csv);
  // All or nothing: a statement with unreadable lines is fixed first, never half-imported.
  if (errors.length > 0) {
    const shown = errors.slice(0, 5).map((e) => `line ${e.line}: ${e.message}`).join(" · ");
    return { error: `Nothing was imported. ${errors.length} problem(s): ${shown}${errors.length > 5 ? " …" : ""}` };
  }
  if (rows.length === 0) return { error: "The statement has no lines." };

  const batch = `import-${new Date().toISOString().slice(0, 19)}`;
  const res = await prisma.bankStatementLine.createMany({
    data: rows.map((r) => ({ tenantId: ctx.tenantId!, campusId, transactionDate: r.transactionDate, reference: r.reference, description: r.description, amountCents: r.amountCents, currency: r.currency, importBatchId: batch, dedupeKey: r.dedupeKey })),
    skipDuplicates: true,
  });
  const skipped = rows.length - res.count;
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.bank.imported", targetType: "BankStatementLine", targetId: batch, campusId, scopeType: "CAMPUS", metadata: { imported: res.count, alreadyPresent: skipped } });
  revalidatePath("/portal/fees/reconciliation");
  return { ok: true, message: skipped > 0 ? `Imported ${res.count} new line(s); ${skipped} were already on file.` : `Imported ${res.count} line(s).` };
}

// FEE-005: match unmatched credits to payments. Unambiguous matches only.
export async function autoReconcile(_p: BankActionState, f: FormData): Promise<BankActionState> {
  const ctx = await requireUser();
  const campusId = text(f, "campusId", 40);
  if (!canForCampus(ctx, "fee.collect", campusId)) return { error: "Permission denied." };

  const lines = await prisma.bankStatementLine.findMany({ where: { tenantId: ctx.tenantId!, campusId, status: "UNMATCHED", amountCents: { gt: 0 } }, orderBy: { transactionDate: "asc" }, take: 2000 });
  if (lines.length === 0) return { ok: true, message: "There are no unmatched credits to check." };
  const from = new Date(lines[0].transactionDate.getTime() - MATCH_WINDOW_DAYS * DAY);
  const to = new Date(lines[lines.length - 1].transactionDate.getTime() + MATCH_WINDOW_DAYS * DAY);
  const taken = new Set((await prisma.bankStatementLine.findMany({ where: { tenantId: ctx.tenantId!, matchedPaymentId: { not: null } }, select: { matchedPaymentId: true } })).map((x) => x.matchedPaymentId!));
  const payments = (await prisma.payment.findMany({ where: { tenantId: ctx.tenantId!, campusId, status: "CONFIRMED", receivedAt: { gte: from, lte: to } }, select: { id: true, number: true, reference: true, amount: true, receivedAt: true } })).filter((p) => !taken.has(p.id));

  let matched = 0, ambiguous = 0;
  const available = new Map(payments.map((p) => [p.id, p]));
  for (const line of lines) {
    const out = matchLine(line, [...available.values()]);
    if (out.kind === "ambiguous") { ambiguous++; continue; }
    if (out.kind !== "match") continue;
    try {
      await prisma.bankStatementLine.update({ where: { id: line.id }, data: { status: "MATCHED", matchedPaymentId: out.paymentId, matchedAt: new Date(), matchedByUserId: ctx.user.id } });
      available.delete(out.paymentId); // one payment settles one line
      matched++;
    } catch { /* the payment was matched by someone else meanwhile (unique constraint) */ }
  }
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.reconciliation.run", targetType: "BankStatementLine", targetId: campusId, campusId, scopeType: "CAMPUS", metadata: { checked: lines.length, matched, ambiguous } });
  revalidatePath("/portal/fees/reconciliation");
  return { ok: true, message: `Matched ${matched} of ${lines.length} credit(s).${ambiguous ? ` ${ambiguous} had several possible receipts; match those by hand.` : ""}` };
}

export async function matchLineManually(_p: BankActionState, f: FormData): Promise<BankActionState> {
  const ctx = await requireUser();
  const r = await lineFor(ctx, text(f, "lineId", 40));
  if ("error" in r) return { error: r.error };
  const { line } = r;
  if (line.status !== "UNMATCHED") return { error: "This line is already handled." };
  if (line.amountCents <= 0) return { error: "Only credits can be matched to receipts." };
  const payment = await prisma.payment.findFirst({ where: { id: text(f, "paymentId", 40), tenantId: ctx.tenantId!, campusId: line.campusId } });
  if (!payment) return { error: "Choose a receipt from this campus." };
  if (payment.status !== "CONFIRMED") return { error: "Only a confirmed payment can be matched." };
  if (payment.amount !== line.amountCents) return { error: `The receipt is ${formatMoney(payment.amount)} but the bank line is ${formatMoney(line.amountCents)}. Amounts must agree.` };
  try {
    await prisma.bankStatementLine.update({ where: { id: line.id }, data: { status: "MANUAL", matchedPaymentId: payment.id, matchedAt: new Date(), matchedByUserId: ctx.user.id } });
  } catch {
    return { error: "That receipt is already matched to another bank line." };
  }
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.reconciliation.manual", targetType: "BankStatementLine", targetId: line.id, campusId: line.campusId, scopeType: "CAMPUS", metadata: { paymentId: payment.id, number: payment.number } });
  revalidatePath("/portal/fees/reconciliation");
  return { ok: true, message: `Matched to ${payment.number}.` };
}

export async function unmatchLine(_p: BankActionState, f: FormData): Promise<BankActionState> {
  const ctx = await requireUser();
  const r = await lineFor(ctx, text(f, "lineId", 40));
  if ("error" in r) return { error: r.error };
  const { line } = r;
  if (line.status !== "MATCHED" && line.status !== "MANUAL") return { error: "This line is not matched." };
  await prisma.bankStatementLine.update({ where: { id: line.id }, data: { status: "UNMATCHED", matchedPaymentId: null, matchedAt: null, matchedByUserId: null } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.reconciliation.unmatched", targetType: "BankStatementLine", targetId: line.id, campusId: line.campusId, scopeType: "CAMPUS", metadata: { wasPaymentId: line.matchedPaymentId } });
  revalidatePath("/portal/fees/reconciliation");
  return { ok: true, message: "Match removed." };
}

export async function excludeLine(_p: BankActionState, f: FormData): Promise<BankActionState> {
  const ctx = await requireUser();
  const r = await lineFor(ctx, text(f, "lineId", 40));
  if ("error" in r) return { error: r.error };
  const { line } = r;
  if (line.status !== "UNMATCHED") return { error: "Only an unmatched line can be set aside." };
  const note = text(f, "note", 200);
  if (note.length < 3) return { error: "Say why this line is not a fee payment (e.g. bank charge, transfer)." };
  await prisma.bankStatementLine.update({ where: { id: line.id }, data: { status: "EXCLUDED", note, matchedAt: new Date(), matchedByUserId: ctx.user.id } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.reconciliation.excluded", targetType: "BankStatementLine", targetId: line.id, campusId: line.campusId, scopeType: "CAMPUS", metadata: { note } });
  revalidatePath("/portal/fees/reconciliation");
  return { ok: true, message: "Line set aside." };
}

export async function restoreLine(_p: BankActionState, f: FormData): Promise<BankActionState> {
  const ctx = await requireUser();
  const r = await lineFor(ctx, text(f, "lineId", 40));
  if ("error" in r) return { error: r.error };
  if (r.line.status !== "EXCLUDED") return { error: "This line is not set aside." };
  await prisma.bankStatementLine.update({ where: { id: r.line.id }, data: { status: "UNMATCHED", note: null, matchedAt: null, matchedByUserId: null } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "fee.reconciliation.restored", targetType: "BankStatementLine", targetId: r.line.id, campusId: r.line.campusId, scopeType: "CAMPUS" });
  revalidatePath("/portal/fees/reconciliation");
  return { ok: true, message: "Line restored to unmatched." };
}
