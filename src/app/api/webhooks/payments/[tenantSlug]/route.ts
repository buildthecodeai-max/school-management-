// Inbound payment-gateway webhook. Public URL, authenticated solely by the
// per-tenant HMAC signature (see lib/gateway-webhooks.ts).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  GATEWAY_PROVIDER,
  gatewayEventSchema,
  processGatewayEvent,
  verifyGatewaySignature,
} from "@/lib/gateway-webhooks";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;
  const rawBody = await req.text();

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true },
  });
  const config = tenant
    ? await prisma.paymentGatewayConfig.findUnique({
        where: { tenantId_provider: { tenantId: tenant.id, provider: GATEWAY_PROVIDER } },
      })
    : null;

  // Same response for unknown tenant, no config and bad signature: no probing.
  if (
    !tenant ||
    !config?.active ||
    !verifyGatewaySignature(config.webhookSecret, req.headers.get("x-scholarum-signature"), rawBody)
  ) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = gatewayEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid event", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await processGatewayEvent(tenant.id, parsed.data, json);
  if (!result.ok) {
    // 422 = permanent (don't retry); 500 = transient (provider should retry).
    return NextResponse.json({ error: result.error }, { status: result.retryable ? 500 : 422 });
  }
  return NextResponse.json({ received: true, status: result.status, paymentId: result.paymentId ?? null });
}
