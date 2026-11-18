"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { requireUser, can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateApiKey, hashSecret, API_SCOPES } from "@/lib/api-auth";
import { redeliverWebhook } from "@/lib/webhooks";
import { WEBHOOK_EVENTS } from "@/lib/webhook-events";
import type { PermissionKey } from "@/lib/permissions";

async function requireIntegrationsManage() {
  const ctx = await requireUser();
  if (!ctx.tenantId || !can(ctx, "integrations.manage")) {
    // Integrations are tenant-wide (no campus dimension), so this is an
    // org-wide-only permission — unlike most other checks in the app, a
    // campus-scoped grant does not satisfy it.
    throw new Error("Managing API clients and webhooks requires organization-wide rights.");
  }
  return ctx;
}

export interface CreateClientState {
  error?: string;
  token?: string;
  keyId?: string;
}

export async function createApiClient(
  _prev: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  const ctx = await requireIntegrationsManage();
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Name is required." };

  const scopes = API_SCOPES.filter((s) => formData.get(`scope:${s}`) === "on");
  if (scopes.length === 0) return { error: "Select at least one scope." };

  const { keyId, secret, token } = generateApiKey();
  const secretHash = await hashSecret(secret);

  await prisma.apiClient.create({
    data: {
      tenantId: ctx.tenantId!,
      name,
      keyId,
      secretHash,
      scopes: scopes as PermissionKey[] as unknown as string[],
      createdByUserId: ctx.user.id,
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "integrations.apiclient.create",
    targetType: "ApiClient",
    metadata: { keyId, scopes },
  });

  revalidatePath("/portal/integrations");
  return { token, keyId };
}

export async function revokeApiClient(formData: FormData) {
  const ctx = await requireIntegrationsManage();
  const id = String(formData.get("id"));
  const client = await prisma.apiClient.findFirst({ where: { id, tenantId: ctx.tenantId! } });
  if (!client) throw new Error("Not found");

  await prisma.apiClient.update({
    where: { id },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "integrations.apiclient.revoke",
    targetType: "ApiClient",
    targetId: id,
  });
  revalidatePath("/portal/integrations");
}

export async function createWebhookEndpoint(formData: FormData) {
  const ctx = await requireIntegrationsManage();
  const url = String(formData.get("url") || "").trim();
  const events = WEBHOOK_EVENTS.filter((e) => formData.get(`event:${e}`) === "on");

  if (!url) throw new Error("A URL is required.");
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("Enter a valid http(s) URL.");
  }
  if (events.length === 0) throw new Error("Select at least one event.");

  const secret = "whsec_" + randomBytes(20).toString("hex");
  await prisma.webhookEndpoint.create({
    data: {
      tenantId: ctx.tenantId!,
      url,
      secret,
      events,
      createdByUserId: ctx.user.id,
    },
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "integrations.webhook.create",
    metadata: { url, events },
  });
  revalidatePath("/portal/integrations");
}

export async function deleteWebhookEndpoint(formData: FormData) {
  const ctx = await requireIntegrationsManage();
  const id = String(formData.get("id"));
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id, tenantId: ctx.tenantId! },
  });
  if (!endpoint) throw new Error("Not found");

  await prisma.webhookEndpoint.delete({ where: { id } });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "integrations.webhook.delete",
    targetId: id,
  });
  revalidatePath("/portal/integrations");
}

export async function redeliverWebhookAction(formData: FormData) {
  const ctx = await requireIntegrationsManage();
  const deliveryId = String(formData.get("deliveryId"));
  await redeliverWebhook(deliveryId, ctx.tenantId!);
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "integrations.webhook.redeliver",
    targetId: deliveryId,
  });
  revalidatePath("/portal/integrations");
}

export async function rotateGatewaySecret() {
  const ctx = await requireIntegrationsManage();
  const webhookSecret = `whsec_${randomBytes(24).toString("hex")}`;
  await prisma.paymentGatewayConfig.upsert({
    where: { tenantId_provider: { tenantId: ctx.tenantId!, provider: "generic" } },
    create: { tenantId: ctx.tenantId!, provider: "generic", webhookSecret },
    update: { webhookSecret, active: true },
  });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: "integrations.gateway.rotate_secret",
  });
  revalidatePath("/portal/integrations");
}

export async function toggleGateway() {
  const ctx = await requireIntegrationsManage();
  const cfg = await prisma.paymentGatewayConfig.findUnique({
    where: { tenantId_provider: { tenantId: ctx.tenantId!, provider: "generic" } },
  });
  if (!cfg) throw new Error("Generate a signing secret first.");
  await prisma.paymentGatewayConfig.update({ where: { id: cfg.id }, data: { active: !cfg.active } });
  await audit({
    tenantId: ctx.tenantId,
    actorUserId: ctx.user.id,
    action: cfg.active ? "integrations.gateway.disable" : "integrations.gateway.enable",
  });
  revalidatePath("/portal/integrations");
}
