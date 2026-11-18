import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { prisma } from "./db";
import { audit } from "./audit";
import { effectiveSetting } from "./settings";
import { nextPaymentNumber, rcpNo, recomputeInvoice } from "./finance-server";

export const GATEWAY_PROVIDER = "generic";
const TOLERANCE_SECONDS = 300;

// Signature header format: `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`.
// Binding the timestamp into the MAC plus a tolerance window blocks replays.
export function signGatewayPayload(secret: string, timestamp: number, rawBody: string): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

export function verifyGatewaySignature(
  secret: string,
  header: string | null,
  rawBody: string,
  now = Date.now(),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1) return false;
  if (Math.abs(now / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"),
  );
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const gatewayEventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  data: z.object({
    reference: z.string().min(1).max(200),
    amount: z.number().int().positive(), // minor units
    currency: z.string().max(10).optional(),
    invoiceNumber: z.string().max(100).optional(),
    admissionNumber: z.string().max(100).optional(),
  }),
});
export type GatewayEvent = z.infer<typeof gatewayEventSchema>;

export type GatewayResult =
  | { ok: true; status: "PROCESSED" | "IGNORED" | "REVIEW" | "DUPLICATE"; paymentId?: string }
  | { ok: false; status: "FAILED"; error: string; retryable: boolean };

class Unprocessable extends Error {}

export async function processGatewayEvent(
  tenantId: string,
  event: GatewayEvent,
  rawPayload: unknown,
): Promise<GatewayResult> {
  const key = { tenantId, provider: GATEWAY_PROVIDER, eventId: event.id };
  const existing = await prisma.gatewayWebhookEvent.findUnique({
    where: { tenantId_provider_eventId: key },
  });
  if (existing && existing.status !== "FAILED") {
    return { ok: true, status: "DUPLICATE", paymentId: existing.paymentId ?? undefined };
  }

  let status: "PROCESSED" | "IGNORED" | "REVIEW" = "IGNORED";
  let paymentId: string | undefined;

  try {
    if (event.type === "payment.succeeded") {
      const result = await postGatewayPayment(tenantId, event);
      status = result.created ? "PROCESSED" : "IGNORED";
      paymentId = result.paymentId;
    } else if (event.type === "payment.refunded" || event.type === "payment.disputed") {
      // Money-out needs a human: refunds are approval-gated (FEE-004), so the
      // gateway can flag one but never reverse a receipt on its own.
      status = "REVIEW";
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error";
    const retryable = !(err instanceof Unprocessable);
    await prisma.gatewayWebhookEvent.upsert({
      where: { tenantId_provider_eventId: key },
      create: { ...key, type: event.type, status: "FAILED", error, payload: rawPayload as object },
      update: { status: "FAILED", error },
    });
    return { ok: false, status: "FAILED", error, retryable };
  }

  await prisma.gatewayWebhookEvent.upsert({
    where: { tenantId_provider_eventId: key },
    create: { ...key, type: event.type, status, paymentId, payload: rawPayload as object },
    update: { status, paymentId, error: null },
  });
  await audit({
    tenantId,
    action: `fee.gateway.${event.type}`,
    targetType: paymentId ? "Payment" : "GatewayEvent",
    targetId: paymentId ?? event.id,
    scopeType: "ORG",
    metadata: { eventId: event.id, status, amount: event.data.amount, reference: event.data.reference },
  });
  return { ok: true, status, paymentId };
}

async function postGatewayPayment(tenantId: string, event: GatewayEvent) {
  const { reference, amount, invoiceNumber, admissionNumber } = event.data;

  const dupe = await prisma.payment.findFirst({
    where: { tenantId, method: "GATEWAY", reference },
  });
  if (dupe) return { created: false, paymentId: dupe.id };

  const invoice = invoiceNumber
    ? await prisma.invoice.findFirst({ where: { tenantId, number: invoiceNumber } })
    : null;
  if (invoiceNumber && !invoice) throw new Unprocessable(`Unknown invoice ${invoiceNumber}`);

  const studentId =
    invoice?.studentId ??
    (admissionNumber
      ? (await prisma.student.findFirst({ where: { tenantId, admissionNumber }, select: { id: true } }))?.id
      : undefined);
  if (!studentId) throw new Unprocessable("Event must identify an invoice or student");

  const enrollment = await prisma.enrollment.findFirst({
    where: { tenantId, studentId, status: "ACTIVE" },
    select: { campusId: true },
  });
  const campusId = enrollment?.campusId ?? invoice?.campusId;
  if (!campusId) throw new Unprocessable("Student has no active enrollment");

  const prefix = await effectiveSetting(tenantId, campusId, "receipt.prefix");
  const seq = await nextPaymentNumber(tenantId);

  const paymentId = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        tenantId,
        campusId,
        studentId,
        number: rcpNo(seq, prefix),
        method: "GATEWAY",
        amount,
        reference,
        status: "CONFIRMED",
        note: `Gateway event ${event.id}`,
      },
    });

    const open = await tx.invoice.findMany({
      where: { studentId, status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: { dueDate: "asc" },
    });
    // The invoice the payer was paying goes first, then oldest-due.
    open.sort((a, b) => Number(b.id === invoice?.id) - Number(a.id === invoice?.id));

    let remaining = amount;
    for (const inv of open) {
      if (remaining <= 0) break;
      const apply = Math.min(remaining, inv.balance);
      if (apply <= 0) continue;
      await tx.allocation.create({
        data: { tenantId, paymentId: payment.id, invoiceId: inv.id, amount: apply },
      });
      remaining -= apply;
      await recomputeInvoice(tx, inv.id);
    }
    return payment.id;
  });

  return { created: true, paymentId };
}
