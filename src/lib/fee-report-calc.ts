// Pure fee-report helpers (no DB).

export const AGING_BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export function daysOverdue(dueDate: Date, now: Date): number {
  return Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
}

export function agingBucket(dueDate: Date, now: Date): AgingBucket {
  const d = daysOverdue(dueDate, now);
  if (d <= 0) return "Current";
  if (d <= 30) return "1–30 days";
  if (d <= 60) return "31–60 days";
  if (d <= 90) return "61–90 days";
  return "90+ days";
}

/** 123450 -> "1234.50" (plain number for spreadsheets). */
export function plainMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function sumBy<T>(rows: T[], key: (r: T) => string, amount: (r: T) => number): { key: string; total: number; count: number }[] {
  const m = new Map<string, { total: number; count: number }>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k) ?? { total: 0, count: 0 };
    cur.total += amount(r);
    cur.count += 1;
    m.set(k, cur);
  }
  return [...m].map(([key, v]) => ({ key, ...v }));
}

export function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function localMonthKey(d: Date): string {
  return localDayKey(d).slice(0, 7);
}
