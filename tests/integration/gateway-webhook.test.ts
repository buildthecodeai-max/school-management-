import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { processGatewayEvent, type GatewayEvent } from "@/lib/gateway-webhooks";
import { prisma, makeTenant, makeCampus, makeStudent, cleanupAll, uid } from "./helpers";

// Inbound gateway events move money, so idempotency and routing are pinned here.

describe("gateway webhook processing", () => {
  let tenantId: string;
  let campusId: string;
  let studentId: string;
  let invoiceA: { id: string; number: string };
  let invoiceB: { id: string; number: string };

  const event = (over: { id?: string; type?: string; data?: Partial<GatewayEvent["data"]> } = {}): GatewayEvent => ({
    id: over.id ?? uid("evt"),
    type: over.type ?? "payment.succeeded",
    data: { reference: uid("ch"), amount: 10_000, ...over.data },
  });

  beforeAll(async () => {
    tenantId = (await makeTenant("Gateway Org")).id;
    campusId = (await makeCampus(tenantId)).id;
    studentId = (await makeStudent({ tenantId, campusId, firstName: "Pay", lastName: "Er", admissionNumber: uid("A") })).id;
    const mk = async (due: string, total: number) => {
      const number = uid("INV");
      const inv = await prisma.invoice.create({
        data: { tenantId, campusId, studentId, number, periodLabel: "T", dueDate: new Date(due), total, balance: total },
      });
      return { id: inv.id, number };
    };
    invoiceA = await mk("2026-01-01", 30_000); // older
    invoiceB = await mk("2026-06-01", 30_000); // newer
  });

  afterAll(cleanupAll);

  const balance = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).balance;

  it("posts a receipt and allocates to the invoice the payer named, ahead of older ones", async () => {
    const res = await processGatewayEvent(tenantId, event({ data: { invoiceNumber: invoiceB.number, amount: 10_000 } }), {});
    expect(res).toMatchObject({ ok: true, status: "PROCESSED" });
    expect(await balance(invoiceB.id)).toBe(20_000);
    expect(await balance(invoiceA.id)).toBe(30_000);
    const payment = await prisma.payment.findFirstOrThrow({ where: { tenantId, method: "GATEWAY" } });
    expect(payment).toMatchObject({ amount: 10_000, status: "CONFIRMED", studentId });
  });

  it("spills an overpayment onto the next oldest invoice", async () => {
    // 25_000: clears the 20_000 left on B, then 5_000 onto the older A.
    await processGatewayEvent(tenantId, event({ data: { invoiceNumber: invoiceB.number, amount: 25_000 } }), {});
    expect(await balance(invoiceB.id)).toBe(0);
    expect(await balance(invoiceA.id)).toBe(25_000);
  });

  it("is idempotent on the event id: a retry changes nothing", async () => {
    const e = event({ data: { amount: 1_000, invoiceNumber: invoiceA.number } });
    const first = await processGatewayEvent(tenantId, e, {});
    const before = await prisma.payment.count({ where: { tenantId } });
    const retry = await processGatewayEvent(tenantId, e, {});
    expect(first).toMatchObject({ status: "PROCESSED" });
    expect(retry).toMatchObject({ ok: true, status: "DUPLICATE", paymentId: (first as { paymentId?: string }).paymentId });
    expect(await prisma.payment.count({ where: { tenantId } })).toBe(before);
  });

  it("does not double-post when the gateway re-sends the same payment under a new event id", async () => {
    const reference = uid("ch");
    const a = await processGatewayEvent(tenantId, event({ data: { reference, amount: 500, invoiceNumber: invoiceA.number } }), {});
    const before = await prisma.payment.count({ where: { tenantId } });
    const b = await processGatewayEvent(tenantId, event({ data: { reference, amount: 500, invoiceNumber: invoiceA.number } }), {});
    expect(a).toMatchObject({ status: "PROCESSED" });
    expect(b).toMatchObject({ ok: true, status: "IGNORED" });
    expect(await prisma.payment.count({ where: { tenantId } })).toBe(before);
  });

  it("fails permanently for an unknown invoice, and never touches another tenant's invoice", async () => {
    const res = await processGatewayEvent(tenantId, event({ data: { invoiceNumber: "NOPE-1" } }), {});
    expect(res).toMatchObject({ ok: false, status: "FAILED", retryable: false });

    const otherTenant = (await makeTenant("Other Gateway Org")).id;
    const cross = await processGatewayEvent(otherTenant, event({ data: { invoiceNumber: invoiceA.number } }), {});
    expect(cross).toMatchObject({ ok: false, retryable: false });
    expect(await prisma.payment.count({ where: { tenantId: otherTenant } })).toBe(0);
  });

  it("requires an invoice or student to attribute the payment", async () => {
    const res = await processGatewayEvent(tenantId, event(), {});
    expect(res).toMatchObject({ ok: false, retryable: false, error: expect.stringMatching(/invoice or student/i) });
  });

  it("flags refunds and disputes for human review without reversing anything", async () => {
    const before = await prisma.payment.findMany({ where: { tenantId }, select: { id: true, status: true } });
    const res = await processGatewayEvent(tenantId, event({ type: "payment.refunded" }), {});
    expect(res).toMatchObject({ ok: true, status: "REVIEW" });
    expect(await prisma.payment.findMany({ where: { tenantId }, select: { id: true, status: true } })).toEqual(before);
  });
});
