import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

let current: unknown;
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/rbac", async (orig) => ({ ...(await orig<typeof import("@/lib/rbac")>()), requireUser: async () => current }));

import { reversePayment } from "@/app/portal/fees/payment-actions";
import { collectionsReport, outstandingReport, discountsReport, refundsReport } from "@/lib/fee-reports";
import { prisma, makeTenant, makeCampus, makeUser, makeStudent, authContextFor, cleanupAll, uid } from "./helpers";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

describe("fee reports and payment reversal", () => {
  let tenantId: string, campusId: string, otherCampus: string, studentA: string, studentB: string;
  let invA: string, payA: string, payB: string, payBig: string;
  let adjuster: unknown, clerk: unknown, otherAdjuster: unknown;

  beforeAll(async () => {
    tenantId = (await makeTenant("Report Org")).id;
    campusId = (await makeCampus(tenantId, "A")).id;
    otherCampus = (await makeCampus(tenantId, "B")).id;
    studentA = (await makeStudent({ tenantId, campusId, firstName: "Ann", lastName: "One", admissionNumber: uid("A") })).id;
    studentB = (await makeStudent({ tenantId, campusId: otherCampus, firstName: "Ben", lastName: "Two", admissionNumber: uid("B") })).id;

    // A: invoice 1000.00 due 40 days ago, paid 400.00 -> balance 600.00 (PARTIAL), overdue
    const inv = await prisma.invoice.create({ data: { tenantId, campusId, studentId: studentA, number: uid("INV"), periodLabel: "T1", dueDate: daysAgo(40), total: 100000, balance: 60000, status: "PARTIAL" } });
    invA = inv.id;
    const p = await prisma.payment.create({ data: { tenantId, campusId, studentId: studentA, number: uid("R"), method: "CASH", amount: 40000, status: "CONFIRMED", receivedAt: daysAgo(2) } });
    payA = p.id;
    await prisma.allocation.create({ data: { tenantId, paymentId: p.id, invoiceId: inv.id, amount: 40000 } });
    // B (other campus): a bank payment and an invoice not yet due
    payB = (await prisma.payment.create({ data: { tenantId, campusId: otherCampus, studentId: studentB, number: uid("R"), method: "BANK", amount: 25000, status: "CONFIRMED", receivedAt: daysAgo(1) } })).id;
    await prisma.invoice.create({ data: { tenantId, campusId: otherCampus, studentId: studentB, number: uid("INV"), periodLabel: "T1", dueDate: daysAgo(-10), total: 50000, balance: 50000, status: "OPEN" } });
    // an old payment and a reversed one must not count in a recent range
    await prisma.payment.create({ data: { tenantId, campusId, studentId: studentA, number: uid("R"), method: "CASH", amount: 99900, status: "REVERSED", receivedAt: daysAgo(2) } });
    await prisma.payment.create({ data: { tenantId, campusId, studentId: studentA, number: uid("R"), method: "CASH", amount: 11100, status: "CONFIRMED", receivedAt: daysAgo(60) } });
    // credit note and refund
    await prisma.creditNote.create({ data: { tenantId, invoiceId: inv.id, amount: 5000, reason: "Sibling discount" } });
    await prisma.refund.create({ data: { tenantId, studentId: studentB, amount: 2000, method: "BANK", reason: "Overpayment" } });

    adjuster = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read", "fee.adjust"], scope: "CAMPUS", campusId })).id);
    clerk = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read"], scope: "CAMPUS", campusId })).id);
    otherAdjuster = await authContextFor((await makeUser({ tenantId, permissions: ["fee.read", "fee.adjust"], scope: "CAMPUS", campusId: otherCampus })).id);
    payBig = payB;
  });
  afterAll(cleanupAll);

  const range = { from: daysAgo(30), to: new Date() };

  it("reports collections within the range, excluding reversed and old receipts, split by method and campus scope", async () => {
    const all = await collectionsReport({ tenantId, campusIds: null, ...range });
    expect(all.total).toBe(65000);
    expect(all.rows).toHaveLength(2);
    expect(all.byMethod.find((m) => m.key === "CASH")!.total).toBe(40000);
    expect(all.byMethod.find((m) => m.key === "BANK")!.total).toBe(25000);
    const scoped = await collectionsReport({ tenantId, campusIds: [campusId], ...range });
    expect(scoped.total).toBe(40000);
    const filtered = await collectionsReport({ tenantId, campusIds: null, ...range, method: "BANK" });
    expect(filtered.total).toBe(25000);
    const wide = await collectionsReport({ tenantId, campusIds: null, from: daysAgo(90), to: new Date() });
    expect(wide.total).toBe(65000 + 11100);
  });

  it("reports outstanding balances with overdue totals and aging buckets, by campus", async () => {
    const out = await outstandingReport({ tenantId, campusIds: null, asOf: new Date() });
    expect(out.total).toBe(110000);
    expect(out.overdueTotal).toBe(60000);
    expect(out.byBucket.find((b) => b.key === "31–60 days")!.total).toBe(60000);
    expect(out.byBucket.find((b) => b.key === "Current")!.total).toBe(50000);
    const scoped = await outstandingReport({ tenantId, campusIds: [otherCampus], asOf: new Date() });
    expect(scoped.total).toBe(50000);
  });

  it("reports discounts and refunds, scoping refunds through the student's campus", async () => {
    const d = await discountsReport({ tenantId, campusIds: null, ...range });
    expect(d.total).toBe(5000);
    expect((await discountsReport({ tenantId, campusIds: [otherCampus], ...range })).total).toBe(0);
    const r = await refundsReport({ tenantId, campusIds: null, ...range });
    expect(r.total).toBe(2000);
    expect(r.rows[0].student.name).toBe("Ben Two");
    expect((await refundsReport({ tenantId, campusIds: [campusId], ...range })).total).toBe(0);
    expect((await refundsReport({ tenantId, campusIds: [otherCampus], ...range })).total).toBe(2000);
  });

  it("reverses a payment: rights, reason, reopening invoices, idempotence and the audit trail", async () => {
    current = clerk;
    expect((await reversePayment({}, fd({ paymentId: payA, reason: "bounced cheque" }))).error).toMatch(/adjustment rights/i);
    current = otherAdjuster;
    expect((await reversePayment({}, fd({ paymentId: payA, reason: "bounced cheque" }))).error).toMatch(/adjustment rights/i);
    current = adjuster;
    expect((await reversePayment({}, fd({ paymentId: payA, reason: "no" }))).error).toMatch(/reason/i);
    expect((await reversePayment({}, fd({ paymentId: "missing", reason: "bounced cheque" }))).error).toMatch(/not found/i);

    expect((await reversePayment({}, fd({ paymentId: payA, reason: "Cheque bounced" }))).ok).toBe(true);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invA } });
    // total 1000.00 less the 50.00 credit note, nothing paid any more
    expect(inv.balance).toBe(95000);
    expect(inv.status).toBe("PARTIAL");
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payA } })).status).toBe("REVERSED");
    expect(await prisma.allocation.count({ where: { paymentId: payA } })).toBe(0);
    expect((await reversePayment({}, fd({ paymentId: payA, reason: "Cheque bounced" }))).error).toMatch(/already reversed/i);
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { chainKey: tenantId, action: "fee.payment.reversed" } });
    expect(JSON.stringify(ev.metadata)).toMatch(/Cheque bounced/);

    // reversal no longer counts in collections
    const after = await collectionsReport({ tenantId, campusIds: [campusId], ...range });
    expect(after.total).toBe(0);
  });

  it("refuses a reversal that would leave the student's account negative after a refund", async () => {
    current = otherAdjuster;
    // B paid 250.00, refunded 20.00 of unapplied credit: reversing would leave -20.00
    const r = await reversePayment({}, fd({ paymentId: payBig, reason: "Duplicate payment" }));
    expect(r.error).toMatch(/refund of .* was already issued/i);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payBig } })).status).toBe("CONFIRMED");
  });
});
