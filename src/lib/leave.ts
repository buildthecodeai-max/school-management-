// Pure leave helpers (unit-tested); the database work lives in the server actions.

export function daysBetweenInclusive(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

// A leave type with 0 days a year is untracked (no entitlement limit).
export function remainingDays(entitlement: number, used: number, pending: number): number | null {
  return entitlement > 0 ? Math.max(0, entitlement - used - pending) : null;
}

// Whole or half days only, and no more than the calendar days in the range.
export function validDaysRequested(days: number, rangeDays: number): string | null {
  if (!Number.isFinite(days) || days <= 0) return "Enter how many days of leave you are taking.";
  if (days * 2 !== Math.round(days * 2)) return "Days must be whole or half days.";
  if (days > rangeDays) return `You cannot take more than ${rangeDays} day(s) within those dates.`;
  return null;
}
