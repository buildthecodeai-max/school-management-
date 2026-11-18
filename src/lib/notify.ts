import "server-only";
import { randomUUID } from "crypto";
import { prisma } from "./db";
import { PROVIDERS } from "./notification-providers";
import { pickByLocale } from "./locales";
import type { NotificationCategory, NotificationChannel } from "@prisma/client";

// Categories that always deliver regardless of user opt-out (NTF-004):
// security and billing notices "follow lawful policy" rather than user
// preference. In-app inbox delivery is always mandatory for every category —
// only the EMAIL/SMS/PUSH escalation channels are ever opted out of.
const MANDATORY_CATEGORIES: NotificationCategory[] = ["SECURITY", "BILLING"];

// Default external channels attempted per category when the user has not
// set an explicit preference (opt-out model: absence of a row = enabled).
const DEFAULT_CHANNELS: Record<NotificationCategory, NotificationChannel[]> = {
  ATTENDANCE: ["EMAIL"],
  FINANCE: ["EMAIL"],
  ACADEMICS: ["EMAIL"],
  ADMISSIONS: ["EMAIL"],
  ANNOUNCEMENT: ["EMAIL"],
  SECURITY: ["EMAIL"],
  BILLING: ["EMAIL"],
};

export interface NotifyInput {
  tenantId: string;
  recipientUserId: string;
  category: NotificationCategory;
  // NTF-007: SENSITIVE messages never send body text via SMS/PUSH
  dataClassification?: "PUBLIC" | "INTERNAL" | "SENSITIVE";
  title: string;
  body: string;
  relatedType?: string;
  relatedId?: string;
  /** Prevents duplicate recipient messages for the same underlying event
   * (NTF-001). Pass something like `attendance:${sessionId}:${studentId}`. */
  dedupeKey?: string;
  /** Bypasses quiet-hours suppression of external channels (emergencies). */
  urgent?: boolean;
}

// NTF-002: Render a named template with variable substitution.
// {{variableName}} placeholders are replaced with values map entries.
export async function notifyFromTemplate(
  templateCode: string,
  variables: Record<string, string>,
  input: Omit<NotifyInput, "title" | "body">,
): Promise<NotifyResult> {
  // NTF locale: recipient's language, then the organization's, then English.
  const [candidates, recipient, tenant] = await Promise.all([
    prisma.messageTemplate.findMany({ where: { tenantId: input.tenantId, code: templateCode } }),
    prisma.user.findUnique({ where: { id: input.recipientUserId }, select: { locale: true } }),
    prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { locale: true } }),
  ]);
  const template = pickByLocale(candidates, [recipient?.locale, tenant?.locale, "en"]);
  if (!template) {
    throw new Error(`Notification template "${templateCode}" not found for tenant ${input.tenantId}`);
  }

  const render = (tpl: string) =>
    tpl.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);

  return notify({
    ...input,
    category: template.category,
    dataClassification: (template.dataClassification as "PUBLIC" | "INTERNAL" | "SENSITIVE") ?? "INTERNAL",
    title: render(template.titleTemplate),
    body: render(template.bodyTemplate),
  });
}

export interface NotifyResult {
  sent: boolean;
  duplicate?: boolean;
  messageId?: string;
  deliveries: { channel: NotificationChannel; status: "SENT" | "FAILED" | "SKIPPED" }[];
}

function currentHour(): number {
  return new Date().getHours();
}

// Is `hour` inside the (possibly wrapping-past-midnight) window [start, end)?
function inQuietWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end; // wraps past midnight
}

/**
 * Central notification dispatch (NTF-001). Every domain event should call
 * this instead of writing to Message directly, so dedup, preferences, quiet
 * hours and delivery logging are applied uniformly.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  // Dedup: the same event must not create duplicate recipient messages.
  if (input.dedupeKey) {
    const existing = await prisma.message.findFirst({
      where: { recipientUserId: input.recipientUserId, dedupeKey: input.dedupeKey },
      select: { id: true },
    });
    if (existing) return { sent: false, duplicate: true, messageId: existing.id, deliveries: [] };
  }

  const recipient = await prisma.user.findUnique({
    where: { id: input.recipientUserId },
    include: { person: true },
  });
  if (!recipient) return { sent: false, deliveries: [] };

  const classification = input.dataClassification ?? "INTERNAL";

  // Always create the in-app inbox record.
  const message = await prisma.message.create({
    data: {
      tenantId: input.tenantId,
      recipientUserId: input.recipientUserId,
      category: input.category,
      dataClassification: classification,
      title: input.title,
      body: input.body,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      dedupeKey: input.dedupeKey,
    },
  });

  const mandatory = MANDATORY_CATEGORIES.includes(input.category);
  const correlationId = randomUUID();

  // Resolve which external channels to attempt.
  const candidateChannels = DEFAULT_CHANNELS[input.category] ?? [];
  const prefs = candidateChannels.length
    ? await prisma.notificationPreference.findMany({
        where: { userId: input.recipientUserId, category: input.category, channel: { in: candidateChannels } },
      })
    : [];
  const disabled = new Set(
    prefs.filter((p) => !p.enabled).map((p) => p.channel),
  );

  const setting = await prisma.notificationSetting.findUnique({
    where: { userId: input.recipientUserId },
  });
  const inQuietHours =
    setting?.quietHoursStartHour != null &&
    setting?.quietHoursEndHour != null &&
    inQuietWindow(currentHour(), setting.quietHoursStartHour, setting.quietHoursEndHour);

  const deliveries: NotifyResult["deliveries"] = [];

  for (const channel of candidateChannels) {
    // Opt-out check (mandatory categories bypass this).
    if (!mandatory && disabled.has(channel)) {
      deliveries.push({ channel, status: "SKIPPED" });
      await prisma.deliveryAttempt.create({
        data: {
          tenantId: input.tenantId,
          messageId: message.id,
          channel,
          provider: PROVIDERS[channel].name,
          status: "SKIPPED",
          error: "Recipient opted out of this channel for this category",
          correlationId,
        },
      });
      continue;
    }
    // Quiet hours suppress non-urgent external delivery (NTF-006), but the
    // in-app message above always lands regardless.
    if (inQuietHours && !input.urgent) {
      deliveries.push({ channel, status: "SKIPPED" });
      await prisma.deliveryAttempt.create({
        data: {
          tenantId: input.tenantId,
          messageId: message.id,
          channel,
          provider: PROVIDERS[channel].name,
          status: "SKIPPED",
          error: "Suppressed during recipient quiet hours",
          correlationId,
        },
      });
      continue;
    }

    const address =
      channel === "EMAIL"
        ? recipient.email
        : channel === "SMS"
          ? recipient.person?.phone
          : recipient.id; // push uses device/user id in a real provider
    if (!address) {
      deliveries.push({ channel, status: "SKIPPED" });
      await prisma.deliveryAttempt.create({
        data: {
          tenantId: input.tenantId,
          messageId: message.id,
          channel,
          provider: PROVIDERS[channel].name,
          status: "SKIPPED",
          error: `No ${channel.toLowerCase()} address on file`,
          correlationId,
        },
      });
      continue;
    }

    const provider = PROVIDERS[channel];
    // NTF-007: SENSITIVE messages must not carry body text over ANY external
    // channel (EMAIL, SMS, PUSH) — only the in-app Message row holds the full
    // body. External delivery carries only a generic prompt.
    const deliveryBody =
      classification === "SENSITIVE"
        ? "You have a confidential notification. Please log in to the portal to read it."
        : input.body;

    const result = await provider.send({
      recipient: address,
      title: input.title,
      body: deliveryBody,
      correlationId,
    });
    deliveries.push({ channel, status: result.status });
    await prisma.deliveryAttempt.create({
      data: {
        tenantId: input.tenantId,
        messageId: message.id,
        channel,
        provider: provider.name,
        recipient: address,
        status: result.status,
        providerRef: result.providerRef,
        error: result.error,
        correlationId,
      },
    });
  }

  return { sent: true, messageId: message.id, deliveries };
}

// Retry a single failed delivery attempt in place (support operations,
// NTF-003). Creates a new attempt row rather than mutating the old one so
// the audit trail of every try is preserved.
export async function retryDelivery(deliveryId: string, tenantId: string) {
  const attempt = await prisma.deliveryAttempt.findFirst({
    where: { id: deliveryId, tenantId },
    include: { message: true },
  });
  if (!attempt || attempt.status !== "FAILED" || !attempt.recipient) return null;

  const provider = PROVIDERS[attempt.channel];
  const correlationId = randomUUID();
  const result = await provider.send({
    recipient: attempt.recipient,
    title: attempt.message.title,
    body: attempt.message.body,
    correlationId,
  });
  return prisma.deliveryAttempt.create({
    data: {
      tenantId,
      messageId: attempt.messageId,
      channel: attempt.channel,
      provider: provider.name,
      recipient: attempt.recipient,
      status: result.status,
      providerRef: result.providerRef,
      error: result.error,
      correlationId,
    },
  });
}
