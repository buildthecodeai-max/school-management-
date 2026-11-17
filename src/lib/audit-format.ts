// Turns a raw audit action code ("platform.user.role_removed") into a short
// human sentence fragment and a category used to pick an icon/color for the
// activity-feed UI. Falls back to a prettified version of the code itself for
// any action not explicitly listed, so a new action type never renders blank.

export type AuditCategory =
  | "campus"
  | "tenant"
  | "user"
  | "role"
  | "billing"
  | "security"
  | "auth"
  | "settings"
  | "other";

const ACTION_LABELS: Record<string, string> = {
  "platform.tenant.provisioned": "provisioned this school",
  "platform.tenant.updated": "updated organization settings",
  "platform.tenant.deleted": "deleted this school",
  "platform.subscription.updated": "updated the subscription",
  "platform.plan.created": "created a plan",
  "platform.plan.updated": "updated a plan",
  "platform.plan.deleted": "deleted a plan",
  "platform.user.created": "created a user",
  "platform.user.enabled": "re-enabled a user",
  "platform.user.disabled": "disabled a user",
  "platform.user.password_reset": "reset a user's password",
  "platform.user.role_assigned": "assigned a role",
  "platform.user.role_removed": "removed a role",
  "campus.created": "created a campus",
  "campus.updated": "updated campus details",
  "campus.active": "reactivated a campus",
  "campus.suspended": "suspended a campus",
  "campus.closed": "closed a campus",
  "iam.impersonation.start": "started impersonating a user",
  "iam.impersonation.end": "ended impersonation",
  "auth.login": "signed in",
  "auth.logout": "signed out",
  "org.setting.updated": "updated an organization setting",
  "campus.setting.updated": "updated a campus setting",
  "campus.setting.cleared": "cleared a campus setting override",
};

const CATEGORY_BY_PREFIX: [prefix: string, category: AuditCategory][] = [
  ["campus.setting", "settings"],
  ["org.setting", "settings"],
  ["campus.", "campus"],
  ["platform.tenant.", "tenant"],
  ["platform.plan.", "billing"],
  ["platform.subscription.", "billing"],
  ["platform.user.role", "role"],
  ["platform.user.", "user"],
  ["iam.impersonation.", "security"],
  ["auth.", "auth"],
];

function prettifyAction(action: string): string {
  return action
    .split(".")
    .join(" ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function describeAuditAction(action: string): {
  text: string;
  category: AuditCategory;
} {
  const text = ACTION_LABELS[action] ?? prettifyAction(action);
  const category =
    CATEGORY_BY_PREFIX.find(([prefix]) => action.startsWith(prefix))?.[1] ?? "other";
  return { text, category };
}

export function relativeTime(date: Date, now: Date = new Date()): string {
  const sec = Math.round((now.getTime() - date.getTime()) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

export function dayLabel(date: Date, now: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const n = new Date(now);
  n.setHours(0, 0, 0, 0);
  const diffDays = Math.round((n.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== n.getFullYear() ? "numeric" : undefined,
  });
}

export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
