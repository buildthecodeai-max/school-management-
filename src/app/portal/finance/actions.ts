"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canForCampus, requireUser } from "@/lib/rbac";
import { toCents } from "@/lib/money";

export type FinanceState = { error?: string; message?: string };

function text(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }

export async function createFinancialAccount(_: FinanceState, form: FormData): Promise<FinanceState> {
  const ctx = await requireUser(); const campusId = text(form, "campusId");
  const name = text(form, "name"); const code = text(form, "code").toUpperCase();
  const type = text(form, "type"); const openingBalance = toCents(text(form, "openingBalance") || "0");
  if (!ctx.tenantId || !canForCampus(ctx, "finance.write", campusId)) return { error: "Permission denied." };
  if (!name || !code || !["CASH", "BANK", "PETTY_CASH", "GATEWAY"].includes(type) || openingBalance < 0) return { error: "Enter a valid account." };
  try {
    const account = await prisma.financialAccount.create({ data: { tenantId: ctx.tenantId, campusId, name, code, type: type as never, openingBalance } });
    await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: "finance.account.created", targetType: "FinancialAccount", targetId: account.id, campusId });
  } catch { return { error: "An account with this code already exists." }; }
  revalidatePath("/portal/finance"); return { message: "Account created." };
}

export async function createFinanceCategory(_: FinanceState, form: FormData): Promise<FinanceState> {
  const ctx = await requireUser(); const campusId = text(form, "campusId"); const name = text(form, "name"); const kind = text(form, "kind");
  if (!ctx.tenantId || !canForCampus(ctx, "finance.write", campusId)) return { error: "Permission denied." };
  if (!name || !["INCOME", "EXPENSE"].includes(kind)) return { error: "Enter a category name and type." };
  try { await prisma.financeCategory.create({ data: { tenantId: ctx.tenantId, campusId, name, kind } }); } catch { return { error: "This category already exists." }; }
  revalidatePath("/portal/finance"); return { message: "Category created." };
}

export async function createFinancialFund(_: FinanceState, form: FormData): Promise<FinanceState> {
  const ctx = await requireUser(); const name = text(form, "name"); const code = text(form, "code").toUpperCase();
  if (!ctx.tenantId || !ctx.hasOrgScope || !canForCampus(ctx, "finance.write", "")) return { error: "Organization-level finance permission required." };
  if (!name || !code) return { error: "Name and code are required." };
  try { await prisma.financialFund.create({ data: { tenantId: ctx.tenantId, name, code } }); } catch { return { error: "This fund code already exists." }; }
  revalidatePath("/portal/finance"); return { message: "Fund created." };
}

export async function recordFinanceTransaction(_: FinanceState, form: FormData): Promise<FinanceState> {
  const ctx = await requireUser(); const campusId = text(form, "campusId"); const accountId = text(form, "accountId");
  const categoryId = text(form, "categoryId") || null; const fundId = text(form, "fundId") || null; const type = text(form, "type");
  const amount = toCents(text(form, "amount")); const description = text(form, "description"); const reference = text(form, "reference") || null;
  if (!ctx.tenantId || !canForCampus(ctx, "finance.write", campusId)) return { error: "Permission denied." };
  if (!accountId || !description || amount <= 0 || !["INCOME", "EXPENSE"].includes(type)) return { error: "Enter an account, type, positive amount and description." };
  const [account, category, fund] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { id: accountId, tenantId: ctx.tenantId, campusId, active: true } }),
    categoryId ? prisma.financeCategory.findFirst({ where: { id: categoryId, tenantId: ctx.tenantId, campusId, active: true } }) : Promise.resolve(null),
    fundId ? prisma.financialFund.findFirst({ where: { id: fundId, tenantId: ctx.tenantId, active: true } }) : Promise.resolve(null),
  ]);
  if (!account || (categoryId && !category) || (fundId && !fund)) return { error: "Select valid account, category and fund values." };
  if (category && category.kind !== type) return { error: "The category type must match the transaction type." };
  const txn = await prisma.financeTransaction.create({ data: { tenantId: ctx.tenantId, campusId, accountId, categoryId, fundId, type: type as never, amount, description, reference, recordedByUserId: ctx.user.id } });
  await audit({ tenantId: ctx.tenantId, actorUserId: ctx.user.id, action: `finance.${type.toLowerCase()}.recorded`, targetType: "FinanceTransaction", targetId: txn.id, campusId, metadata: { accountId, categoryId, fundId, amount } });
  revalidatePath("/portal/finance"); return { message: `${type === "INCOME" ? "Income" : "Expense"} recorded.` };
}
