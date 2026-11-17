import "server-only";
import type { NotificationChannel } from "@prisma/client";

// Pluggable messaging providers (NTF-005). These are simulated/local
// providers: they never make an outbound network call, they just record what
// would have been sent. Swap in a real SDK (SES, Twilio, FCM, etc.) behind
// the same interface for production — nothing else in the notification
// service needs to change.

export interface ProviderSendInput {
  recipient: string; // email address or phone number
  title: string;
  body: string;
  correlationId: string;
}
export interface ProviderSendResult {
  status: "SENT" | "FAILED";
  providerRef?: string;
  error?: string;
}
export interface NotificationProvider {
  channel: NotificationChannel;
  name: string;
  send(input: ProviderSendInput): Promise<ProviderSendResult>;
}

// A tiny deterministic "flakiness" so the delivery log has something to show
// in demos — a small percentage of sends fail, hashed from the recipient so
// it's stable across renders rather than actually random.
function simulatedFailure(seed: string): boolean {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 20 === 0; // ~5% failure rate
}

export const consoleEmailProvider: NotificationProvider = {
  channel: "EMAIL",
  name: "console-email",
  async send(input) {
    const fail = simulatedFailure(input.recipient + input.correlationId);
    // eslint-disable-next-line no-console
    console.log(
      `[email:${fail ? "FAILED" : "sent"}] to=${input.recipient} subject="${input.title}" corr=${input.correlationId}`,
    );
    if (fail) return { status: "FAILED", error: "Simulated provider timeout" };
    return { status: "SENT", providerRef: `console-email-${input.correlationId}` };
  },
};

export const consoleSmsProvider: NotificationProvider = {
  channel: "SMS",
  name: "console-sms",
  async send(input) {
    const fail = simulatedFailure(input.recipient + input.correlationId + "sms");
    // eslint-disable-next-line no-console
    console.log(
      `[sms:${fail ? "FAILED" : "sent"}] to=${input.recipient} body="${input.body.slice(0, 40)}…" corr=${input.correlationId}`,
    );
    if (fail) return { status: "FAILED", error: "Simulated carrier rejection" };
    return { status: "SENT", providerRef: `console-sms-${input.correlationId}` };
  },
};

export const consolePushProvider: NotificationProvider = {
  channel: "PUSH",
  name: "console-push",
  async send(input) {
    // eslint-disable-next-line no-console
    console.log(`[push:sent] to=${input.recipient} title="${input.title}" corr=${input.correlationId}`);
    return { status: "SENT", providerRef: `console-push-${input.correlationId}` };
  },
};

export const PROVIDERS: Record<NotificationChannel, NotificationProvider> = {
  EMAIL: consoleEmailProvider,
  SMS: consoleSmsProvider,
  PUSH: consolePushProvider,
};
