import "server-only";
import { prisma } from "./db";

// TEN-003 / BRN-003 — the configurable settings catalogue and the resolver that
// applies organization → campus inheritance with lock/override semantics.
//
// Each key has a hard default. An OrgSetting overrides the default for the whole
// tenant. A CampusSetting overrides the org value for one campus — UNLESS the
// OrgSetting is `locked`, in which case the org value wins everywhere and the
// campus override is ignored (and the UI disables editing it).

export interface SettingDef {
  label: string;
  description: string;
  default: string;
  group: string;
  kind: "text" | "int" | "cents";
}

export const SETTING_DEFS = {
  "invoice.prefix": { label: "Invoice prefix", description: "Leading characters on invoice numbers", default: "INV", group: "Numbering", kind: "text" },
  "receipt.prefix": { label: "Receipt prefix", description: "Leading characters on receipt numbers", default: "RCP", group: "Numbering", kind: "text" },
  "admission.prefix": { label: "Admission number prefix", description: "Leading characters on admission numbers", default: "ADM", group: "Numbering", kind: "text" },
  "fees.lateFeeCents": { label: "Late fee", description: "Flat late fee charged when a payment is overdue", default: "500", group: "Fees", kind: "cents" },
  "fees.graceperiodDays": { label: "Late fee grace period (days)", description: "Days after the due date before a late fee applies", default: "7", group: "Fees", kind: "int" },
  "attendance.lockLagDays": { label: "Attendance lock lag (days)", description: "Days after which an attendance session can no longer be edited", default: "3", group: "Attendance", kind: "int" },
  "attendance.notifyDelayMinutes": { label: "Absence alert delay (minutes)", description: "Verification delay before a guardian absence alert is sent", default: "45", group: "Attendance", kind: "int" },
  "library.loanDays": { label: "Default loan period (days)", description: "Default number of days for a library loan", default: "14", group: "Library", kind: "int" },
  "library.maxLoansPerUser": { label: "Max concurrent loans", description: "Maximum items a borrower may hold at once", default: "3", group: "Library", kind: "int" },
  "library.finePerDayCents": { label: "Overdue fine per day", description: "Fine accrued for each day an item is overdue", default: "500", group: "Library", kind: "cents" },
  "inventory.lowStockThreshold": { label: "Low-stock alert threshold", description: "Alert when stock falls at or below this level", default: "5", group: "Inventory", kind: "int" },
  "notifications.throttleMax": { label: "Max external notifications per recipient", description: "Email/SMS sent to one person within the window before further non-urgent ones are held back (they still reach the in-app inbox). 0 = no limit", default: "10", group: "Notifications", kind: "int" },
  "notifications.throttleWindowMinutes": { label: "Notification throttle window (minutes)", description: "Length of the rolling window used by the limit above", default: "60", group: "Notifications", kind: "int" },
  "exam.passThresholdPct": { label: "Pass threshold (%)", description: "Minimum percentage to be marked as passed", default: "50", group: "Exams", kind: "int" },
} as const satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTING_DEFS;

export const SETTING_KEYS = Object.keys(SETTING_DEFS) as SettingKey[];

export function isSettingKey(k: string): k is SettingKey {
  return k in SETTING_DEFS;
}

export type EffectiveSource = "campus" | "organization" | "default";

export interface EffectiveSetting {
  key: SettingKey;
  value: string;
  source: EffectiveSource;
  locked: boolean;
  orgValue: string | null;
  campusValue: string | null;
  def: SettingDef;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

// Effective value + provenance for every known key, for one campus (or the
// organization view when campusId is omitted).
export async function effectiveSettings(
  tenantId: string,
  campusId?: string,
): Promise<Record<SettingKey, EffectiveSetting>> {
  const [orgRows, campusRows] = await Promise.all([
    prisma.orgSetting.findMany({ where: { tenantId } }),
    campusId
      ? prisma.campusSetting.findMany({ where: { tenantId, campusId } })
      : Promise.resolve([]),
  ]);

  const orgByKey = new Map(orgRows.map((r) => [r.key, r]));
  const campusByKey = new Map(campusRows.map((r) => [r.key, r]));

  const out = {} as Record<SettingKey, EffectiveSetting>;
  for (const key of SETTING_KEYS) {
    const def = SETTING_DEFS[key];
    const org = orgByKey.get(key);
    const camp = campusByKey.get(key);
    const locked = org?.locked ?? false;
    const orgValue = org ? asString(org.value) : null;
    const campusValue = camp ? asString(camp.value) : null;

    let value: string;
    let source: EffectiveSource;
    if (campusId && campusValue !== null && !locked) {
      value = campusValue;
      source = "campus";
    } else if (orgValue !== null) {
      value = orgValue;
      source = "organization";
    } else {
      value = def.default;
      source = "default";
    }
    out[key] = { key, value, source, locked, orgValue, campusValue, def };
  }
  return out;
}

// Single effective value — used by feature code (numbering, fees, attendance…)
// that just needs "what applies here".
export async function effectiveSetting(
  tenantId: string,
  campusId: string | null,
  key: SettingKey,
): Promise<string> {
  const all = await effectiveSettings(tenantId, campusId ?? undefined);
  return all[key].value;
}

export async function effectiveSettingInt(
  tenantId: string,
  campusId: string | null,
  key: SettingKey,
): Promise<number> {
  const raw = await effectiveSetting(tenantId, campusId, key);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : Number.parseInt(SETTING_DEFS[key].default, 10);
}

export function validateSettingValue(key: SettingKey, value: string): string | null {
  const def = SETTING_DEFS[key];
  const v = value.trim();
  if (def.kind === "int" || def.kind === "cents") {
    if (!/^\d+$/.test(v)) return `${def.label} must be a whole number.`;
    if (def.kind === "cents" && Number(v) > 100_000_00) return `${def.label} is unreasonably large.`;
  }
  if (def.kind === "text" && v.length > 40) return `${def.label} must be 40 characters or fewer.`;
  return null;
}
