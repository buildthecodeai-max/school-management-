"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser, canForCampus } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export interface BankActionState {
  ok?: boolean;
  error?: string;
  message?: string;
  imported?: number;
  matched?: number;
  exportCsv?: string;
}

// FEE-003: Import bank/gateway statement lines from CSV text.
// Expected CSV columns: transactionDate,reference,description,amount,currency
// Amount is a decimal (positive = credit). Caller reads the file client-side and
// passes the text as the "csv" form field.
const importSchema = z.object({
  campusId: z.string().min(1),
  csv: z.string().min(1),
  batchId: z.string().optional(),
});

export async function importBankStatement(
  _prev: BankActionState,
  formData: FormData,
): Promise<BankActionState> {
  const ctx = await requireUser();
  const parsed = importSchema.safeParse({
    campusId: formData.get("campusId"),
    csv: formData.get("csv"),
    batchId: formData.get("batchId") || undefined,
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, csv, batchId } = parsed.data;
  if (!canForCampus(ctx, "fee.bill", campusId)) return { error: "Permission denied." };

  const lines = csv.trim().split("\n");
  const header = lines.shift()?.toLowerCase() ?? "";
  if (!header.includes("date") || !header.includes("amount")) {
    return { error: "CSV must have a header row with 'date' and 'amount' columns." };
  }

  const importBatchId = batchId ?? `import-${Date.now()}`;
  const rows: {
    tenantId: string;
    campusId: string;
    transactionDate: Date;
    reference: string | null;
    description: string | null;
    amountCents: number;
    currency: string;
    importBatchId: string;
  }[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const [dateStr, reference, description, amountStr, currency] = cols;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) continue;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) continue;
    rows.push({
      tenantId: ctx.tenantId!,
      campusId,
      transactionDate: date,
      reference: reference || null,
      description: description || null,
      amountCents: Math.round(amount * 100),
      currency: currency || "USD",
      importBatchId,
    });
  }

  if (rows.length === 0) return { error: "No valid rows found in CSV." };

  await prisma.bankStatementLine.createMany({ data: rows, skipDuplicates: true });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.bank.imported",
    targetType: "BankStatementLine",
    targetId: importBatchId,
    campusId,
    metadata: { count: rows.length, importBatchId },
  });

  revalidatePath("/portal/fees");
  return { ok: true, message: `Imported ${rows.length} bank statement line(s).`, imported: rows.length };
}

// FEE-005: Automated reconciliation — match UNMATCHED bank lines against student payments.
// Matching heuristic: amountCents match + transactionDate within ±3 days + UNMATCHED status.
const reconcileSchema = z.object({
  campusId: z.string().min(1),
  importBatchId: z.string().optional(),
});

export async function reconcilePayments(
  _prev: BankActionState,
  formData: FormData,
): Promise<BankActionState> {
  const ctx = await requireUser();
  const parsed = reconcileSchema.safeParse({
    campusId: formData.get("campusId"),
    importBatchId: formData.get("importBatchId") || undefined,
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, importBatchId } = parsed.data;
  if (!canForCampus(ctx, "fee.bill", campusId)) return { error: "Permission denied." };

  const unmatched = await prisma.bankStatementLine.findMany({
    where: {
      tenantId: ctx.tenantId!,
      campusId,
      status: "UNMATCHED",
      ...(importBatchId ? { importBatchId } : {}),
      amountCents: { gt: 0 }, // credits only
    },
  });

  let matched = 0;
  for (const line of unmatched) {
    const windowStart = new Date(line.transactionDate);
    windowStart.setDate(windowStart.getDate() - 3);
    const windowEnd = new Date(line.transactionDate);
    windowEnd.setDate(windowEnd.getDate() + 3);

    const payment = await prisma.payment.findFirst({
      where: {
        tenantId: ctx.tenantId!,
        campusId,
        amount: line.amountCents,
        receivedAt: { gte: windowStart, lte: windowEnd },
        // Exclude already-matched payments
        NOT: { id: { in: await getAlreadyMatchedPaymentIds(ctx.tenantId!, campusId) } },
      },
    });

    if (payment) {
      await prisma.bankStatementLine.update({
        where: { id: line.id },
        data: { status: "MATCHED", matchedPaymentId: payment.id },
      });
      matched++;
    }
  }

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.reconciliation.run",
    targetType: "BankStatementLine",
    targetId: campusId,
    campusId,
    metadata: { checked: unmatched.length, matched },
  });

  revalidatePath("/portal/fees");
  return { ok: true, matched, message: `Matched ${matched} of ${unmatched.length} bank lines.` };
}

async function getAlreadyMatchedPaymentIds(tenantId: string, campusId: string): Promise<string[]> {
  const rows = await prisma.bankStatementLine.findMany({
    where: { tenantId, campusId, status: "MATCHED", matchedPaymentId: { not: null } },
    select: { matchedPaymentId: true },
  });
  return rows.map((r) => r.matchedPaymentId!).filter(Boolean);
}

// FEE-007: GL journal CSV export — one row per FeeHead with debit/credit totals.
// Format: date, account_code, account_name, debit_cents, credit_cents, description
const glExportSchema = z.object({
  campusId: z.string().min(1),
  fromDate: z.string().min(1),
  toDate: z.string().min(1),
});

export async function exportGLJournal(
  _prev: BankActionState,
  formData: FormData,
): Promise<BankActionState> {
  const ctx = await requireUser();
  const parsed = glExportSchema.safeParse({
    campusId: formData.get("campusId"),
    fromDate: formData.get("fromDate"),
    toDate: formData.get("toDate"),
  });
  if (!parsed.success) return { error: "Invalid form data." };
  const { campusId, fromDate, toDate } = parsed.data;
  if (!canForCampus(ctx, "fee.read", campusId)) return { error: "Permission denied." };

  const from = new Date(fromDate);
  const to = new Date(toDate);

  // Fetch invoice lines joined to FeeHead for GL account mapping.
  const invoiceLines = await prisma.invoiceLine.findMany({
    where: {
      invoice: {
        tenantId: ctx.tenantId!,
        campusId,
        issueDate: { gte: from, lte: to },
      },
    },
    include: { feeHead: true },
  });

  // Group by feeHead, accumulate debit totals (invoiced = debit AR, credit revenue).
  const byHead = new Map<string, { head: NonNullable<typeof invoiceLines[0]["feeHead"]>; debitCents: number }>();
  for (const line of invoiceLines) {
    if (!line.feeHeadId || !line.feeHead) continue;
    const key = line.feeHeadId;
    const existing = byHead.get(key);
    if (existing) {
      existing.debitCents += line.amount;
    } else {
      byHead.set(key, { head: line.feeHead, debitCents: line.amount });
    }
  }

  // Build CSV.
  const rows = ["date,account_code,account_name,debit_cents,credit_cents,description"];
  const dateStr = toDate;
  for (const { head, debitCents } of byHead.values()) {
    const glCode = head.glAccountCode ?? head.id.slice(0, 8).toUpperCase();
    rows.push(
      `${dateStr},${glCode},"${head.name}",${debitCents},0,"Fees revenue ${fromDate}–${toDate}"`,
    );
    // Contra: AR debit
    rows.push(
      `${dateStr},AR-${glCode},"Accounts Receivable – ${head.name}",0,${debitCents},"AR contra"`,
    );
  }

  const exportCsv = rows.join("\n");

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "fee.gl.export",
    targetType: "GLExport",
    targetId: campusId,
    campusId,
    metadata: { fromDate, toDate, lines: byHead.size },
  });

  return { ok: true, exportCsv, message: `GL journal export ready (${byHead.size} account(s)).` };
}
