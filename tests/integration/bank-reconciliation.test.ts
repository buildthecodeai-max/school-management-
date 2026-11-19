import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { importBankStatement, autoReconcile, matchLineManually, unmatchLine, excludeLine, restoreLine } from "@/app/portal/fees/bank-actions";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const day = (n: number) => { const d = new Date(Date.now() - n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const at = (n: number) => { const d = new Date(Date.now() - n * 86_400_000); d.setHours(12, 0, 0, 0); return d; };

describe("bank statement import and reconciliation", () => {
  let tenantId: string, campusId: string, otherCampus: string, studentId: string, otherStudent: string;
  let clerk: unknown, reader: unknown, otherClerk: unknown, foreignLine: string;
  const pay: Record<string, string> = {};

  beforeAll(async () => {
    tenantId = (await makeTenant("Bank Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    studentId = (await makeStudent({ tenantId, campusId, firstName: "Ann", lastName: "One", admissionNumber: uid("A") })).id;
    otherStudent = (await makeStudent({ tenantId, campusId: otherCampus, firstName: "Ben", lastName: "Two", admissionNumber: uid("B") })).id;
    const mkPay = (key: string, amount: number, ageDays: number, extra: Record<string, unknown> = {}) =>
      prisma.payment.create({ data: { tenantId, campusId, studentId, number: uid("RCP"), method: "BANK", amount, status: "CONFIRMED", receivedAt: at(ageDays), ...extra } }).then((p) => { pay[key] = p.id; });
    await mkPay("single", 50000, 5);
    await mkPay("twinA", 70000, 5);
    await mkPay("twinB", 70000, 5);
    await mkPay("refd", 90000, 5, { reference: "FT-REF-777" });
    await mkPay("refdTwin", 90000, 5);
    await mkPay("oneOnly", 30000, 5);
    await mkPay("reversed", 11000, 5, { status: "REVERSED" });
    pay.otherCampus = (await prisma.payment.create({ data: { tenantId, campusId: otherCampus, studentId: otherStudent, number: uid("RCP"), method: "BANK", amount: 50000, status: "CONFIRMED", receivedAt: at(5) } })).id;

    clerk = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read", "fee.collect"], scope: "CAMPUS", campusId })).id);
    reader = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read"], scope: "CAMPUS", campusId })).id);
    otherClerk = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read", "fee.collect"], scope: "CAMPUS", campusId: otherCampus })).id);
    const t2 = (await makeTenant("Other Bank Org")).id;
    const c2 = (await makeCampus(t2, "X")).id;
    foreignLine = (await prisma.bankStatementLine.create({ data: { tenantId: t2, campusId: c2, transactionDate: new Date(), amountCents: 100 } })).id;
  });
  afterAll(cleanupAll);

  const statement = [
    "date,reference,description,amount",
    `${day(5)},BK1,"Fees, term 1",500.00`,
    `${day(5)},BK2,Fees,700.00`,
    `${day(5)},FT-REF-777,Fees,900.00`,
    `${day(5)},BK4,Fees,300.00`,
    `${day(5)},BK4,Fees,300.00`,
    `${day(5)},BK5,Bank charge,-12.50`,
    `${day(5)},BK6,Unknown deposit,110.00`,
  ].join("\n");
  const lineBy = (ref: string, nth = 0) => prisma.bankStatementLine.findMany({ where: { tenantId, reference: ref }, orderBy: { id: "asc" } }).then((l) => l[nth]);

  it("imports only with collect rights, all-or-nothing, and never twice", async () => {
    current = reader;
    expect((await importBankStatement({}, fd({ campusId, csv: statement }))).error).toMatch(/permission/i);
    current = otherClerk;
    expect((await importBankStatement({}, fd({ campusId, csv: statement }))).error).toMatch(/permission/i);
    current = clerk;
    const bad = await importBankStatement({}, fd({ campusId, csv: `date,amount\n${day(1)},10\n05/03/2026,20\n${day(1)},abc` }));
    expect(bad.error).toMatch(/Nothing was imported.*2 problem/);
    expect(await prisma.bankStatementLine.count({ where: { tenantId } })).toBe(0);
    expect((await importBankStatement({}, fd({ campusId, csv: "name,total\nx,1" }))).error).toMatch(/date.*amount/i);

    expect((await importBankStatement({}, fd({ campusId, csv: statement }))).message).toMatch(/Imported 7 line/);
    expect(await prisma.bankStatementLine.count({ where: { tenantId, reference: "BK4" } })).toBe(2); // identical lines both kept
    const again = await importBankStatement({}, fd({ campusId, csv: statement }));
    expect(again.message).toMatch(/Imported 0 new.*7 were already on file/);
    expect(await prisma.bankStatementLine.count({ where: { tenantId } })).toBe(7);
  });

  it("auto-matches only unambiguous lines, prefers references, and uses each receipt once", async () => {
    current = reader;
    expect((await autoReconcile({}, fd({ campusId }))).error).toMatch(/permission/i);
    current = clerk;
    const r = await autoReconcile({}, fd({ campusId }));
    expect(r.ok).toBe(true);
    // single 500.00 -> unique (the other campus's 500.00 receipt is out of scope)
    expect(await lineBy("BK1")).toMatchObject({ status: "MATCHED", matchedPaymentId: pay.single });
    // two 700.00 receipts fit -> not guessed
    expect(await lineBy("BK2")).toMatchObject({ status: "UNMATCHED", matchedPaymentId: null });
    // reference in the narrative picks the right one of two 900.00 receipts
    expect(await lineBy("FT-REF-777")).toMatchObject({ status: "MATCHED", matchedPaymentId: pay.refd });
    // two identical 300.00 lines, one receipt: exactly one match
    const bk4 = await prisma.bankStatementLine.findMany({ where: { tenantId, reference: "BK4" } });
    expect(bk4.filter((l) => l.status === "MATCHED")).toHaveLength(1);
    expect(bk4.filter((l) => l.status === "UNMATCHED")).toHaveLength(1);
    // debits and a reversed-payment amount are never matched
    expect(await lineBy("BK5")).toMatchObject({ status: "UNMATCHED" });
    expect(await lineBy("BK6")).toMatchObject({ status: "UNMATCHED" });
  });

  it("matches manually only with equal amounts, confirmed receipts of this campus, one line per receipt", async () => {
    current = clerk;
    const ambiguous = await lineBy("BK2");
    expect((await matchLineManually({}, fd({ lineId: foreignLine, paymentId: pay.twinA }))).error).toMatch(/not found/i);
    expect((await matchLineManually({}, fd({ lineId: ambiguous.id, paymentId: pay.single }))).error).toMatch(/amounts must agree/i);
    expect((await matchLineManually({}, fd({ lineId: ambiguous.id, paymentId: pay.otherCampus }))).error).toMatch(/receipt from this campus/i);
    expect((await matchLineManually({}, fd({ lineId: ambiguous.id, paymentId: pay.reversed }))).error).toMatch(/amounts must agree|confirmed/i);
    expect((await matchLineManually({}, fd({ lineId: ambiguous.id, paymentId: pay.twinB }))).ok).toBe(true);
    expect(await lineBy("BK2")).toMatchObject({ status: "MANUAL", matchedPaymentId: pay.twinB });
    // the same receipt cannot serve a second line
    const unmatched4 = (await prisma.bankStatementLine.findMany({ where: { tenantId, reference: "BK4", status: "UNMATCHED" } }))[0];
    const matched4 = (await prisma.bankStatementLine.findMany({ where: { tenantId, reference: "BK4", status: "MATCHED" } }))[0];
    expect((await matchLineManually({}, fd({ lineId: unmatched4.id, paymentId: matched4.matchedPaymentId! }))).error).toMatch(/already matched/i);
    // debits cannot be matched
    expect((await matchLineManually({}, fd({ lineId: (await lineBy("BK5")).id, paymentId: pay.oneOnly }))).error).toMatch(/only credits/i);
  });

  it("unmatches, sets lines aside with a reason, and restores them; every step is audited", async () => {
    current = clerk;
    const m = await lineBy("BK2");
    expect((await unmatchLine({}, fd({ lineId: m.id }))).ok).toBe(true);
    expect(await lineBy("BK2")).toMatchObject({ status: "UNMATCHED", matchedPaymentId: null, matchedByUserId: null });
    expect((await unmatchLine({}, fd({ lineId: m.id }))).error).toMatch(/not matched/i);
    const charge = await lineBy("BK5");
    expect((await excludeLine({}, fd({ lineId: charge.id, note: "" }))).error).toMatch(/why/i);
    expect((await excludeLine({}, fd({ lineId: charge.id, note: "Bank charge" }))).ok).toBe(true);
    expect(await lineBy("BK5")).toMatchObject({ status: "EXCLUDED", note: "Bank charge" });
    expect((await restoreLine({}, fd({ lineId: charge.id }))).ok).toBe(true);
    expect(await lineBy("BK5")).toMatchObject({ status: "UNMATCHED", note: null });
    current = otherClerk;
    expect((await excludeLine({}, fd({ lineId: charge.id, note: "not mine" }))).error).toMatch(/permission/i);
    const actions = (await prisma.auditEvent.findMany({ where: { chainKey: tenantId, action: { startsWith: "fee." } } })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["fee.bank.imported", "fee.reconciliation.run", "fee.reconciliation.manual", "fee.reconciliation.unmatched", "fee.reconciliation.excluded", "fee.reconciliation.restored"]));
  });
});
