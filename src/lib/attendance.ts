// Pure attendance helpers (no DB): date parsing, summaries and percentages.

export const BACKDATE_LIMIT_DAYS = 7; // older than this needs attendance.amend
export const SHORTAGE_DEFAULT = 85; // % below which a student is flagged

/** Parse YYYY-MM-DD into a local-midnight Date (the key registers are stored under). */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

export function formatDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export type DateCheck = { ok: true } | { ok: false; error: string };

/** Registers cannot be taken for the future; old dates need the amend permission. */
export function checkRegisterDate(date: Date, today: Date, canAmend: boolean): DateCheck {
  const age = daysBetween(date, today);
  if (age < 0) return { ok: false, error: "You cannot record attendance for a future date." };
  if (age > BACKDATE_LIMIT_DAYS && !canAmend)
    return { ok: false, error: `Registers older than ${BACKDATE_LIMIT_DAYS} days can only be changed by someone with amend rights.` };
  return { ok: true };
}

export type Tally = { present: number; absent: number; late: number; excused: number; leave: number; remote: number; total: number };
export const emptyTally = (): Tally => ({ present: 0, absent: 0, late: 0, excused: 0, leave: 0, remote: 0, total: 0 });

const CATEGORY_KEY: Record<string, keyof Tally> = {
  PRESENT: "present", ABSENT: "absent", LATE: "late", EXCUSED: "excused", LEAVE: "leave", REMOTE: "remote",
};

export function addToTally(t: Tally, category: string) {
  const key = CATEGORY_KEY[category];
  if (key) t[key]++;
  t.total++;
}

/** Attendance % = days counted present / days marked. Null when nothing was marked. */
export function attendancePct(countedPresent: number, total: number): number | null {
  return total === 0 ? null : Math.round((countedPresent / total) * 1000) / 10;
}

export type Change = { studentId: string; fromCodeId: string | null; toCodeId: string };

/** Differences between stored marks and submitted marks. */
export function diffMarks(existing: Record<string, string>, next: Record<string, string>): Change[] {
  const out: Change[] = [];
  for (const [studentId, toCodeId] of Object.entries(next)) {
    if (!toCodeId) continue;
    const fromCodeId = existing[studentId] ?? null;
    if (fromCodeId !== toCodeId) out.push({ studentId, fromCodeId, toCodeId });
  }
  return out;
}
