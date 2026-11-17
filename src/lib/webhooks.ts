import "server-only";
import { createHmac, randomUUID } from "crypto";
import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

// Signs a webhook payload the same way GitHub/Stripe do: HMAC-SHA256 over
// the raw JSON body using the endpoint's own secret, sent as a header so the
// receiver can verify authenticity without a shared network secret.
export function signPayload(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Emits `event` to every ACTIVE endpoint subscribed to it for this tenant
 * (API-005). Each delivery is signed, versioned via the event name itself,
 * and logged — success or failure — so the tenant can observe and replay it.
 * Fire-and-forget from the caller's perspective: failures never throw.
 */
export async function emitWebhook(
  tenantId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId, status: "ACTIVE", events: { has: event } },
  });
  if (endpoints.length === 0) return;

  const envelope = {
    id: randomUUID(),
    event,
    occurredAt: new Date().toISOString(),
    data: payload,
  };
  const rawBody = JSON.stringify(envelope);

  await Promise.all(endpoints.map((ep) => deliverOnce(ep, event, envelope, rawBody, 1)));
}

async function deliverOnce(
  endpoint: { id: string; tenantId: string; url: string; secret: string },
  event: string,
  envelope: Record<string, unknown>,
  rawBody: string,
  attempt: number,
): Promise<void> {
  const correlationId = randomUUID();
  const signature = signPayload(endpoint.secret, rawBody);

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Scholarum-Event": event,
        "X-Scholarum-Delivery": correlationId,
        "X-Scholarum-Signature": `sha256=${signature}`,
      },
      body: rawBody,
      signal: AbortSignal.timeout(8000),
    });
    await prisma.webhookDelivery.create({
      data: {
        tenantId: endpoint.tenantId,
        endpointId: endpoint.id,
        event,
        payload: envelope as Prisma.InputJsonValue,
        status: res.ok ? "DELIVERED" : "FAILED",
        httpStatus: res.status,
        error: res.ok ? null : `HTTP ${res.status}`,
        attempt,
        correlationId,
      },
    });
  } catch (err) {
    await prisma.webhookDelivery.create({
      data: {
        tenantId: endpoint.tenantId,
        endpointId: endpoint.id,
        event,
        payload: envelope as Prisma.InputJsonValue,
        status: "FAILED",
        error: err instanceof Error ? err.message : "Delivery failed",
        attempt,
        correlationId,
      },
    });
  }
}

// Manual redelivery from the ops UI: replays the exact stored payload as a
// new, incremented attempt, preserving the original failed row.
export async function redeliverWebhook(deliveryId: string, tenantId: string) {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, tenantId },
    include: { endpoint: true },
  });
  if (!delivery) return null;
  const rawBody = JSON.stringify(delivery.payload);
  await deliverOnce(
    delivery.endpoint,
    delivery.event,
    delivery.payload as Record<string, unknown>,
    rawBody,
    delivery.attempt + 1,
  );
}
