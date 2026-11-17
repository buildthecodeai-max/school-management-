// The catalog of events a tenant may subscribe a webhook endpoint to.
// Keep this list and the `emitWebhook(...)` call sites in sync — it's also
// what the API client management UI and OpenAPI doc render.
export const WEBHOOK_EVENTS = [
  "student.enrolled",
  "attendance.session.submitted",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
