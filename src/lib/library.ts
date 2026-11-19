// Pure library circulation rules.

export const MAX_ACTIVE_LOANS = 5;
export const MAX_RENEWALS = 2;
export const FINE_PER_DAY_CENTS = 25;
export const FINE_CAP_CENTS = 1000;
export const LOAN_DAYS = [7, 14, 21, 30] as const;
export const RESERVATION_DAYS = 7;

const DAY = 86_400_000;

export function daysLate(due: Date, returnedAt: Date): number {
  return Math.max(0, Math.floor((returnedAt.getTime() - due.getTime()) / DAY));
}

/** 25 cents per full day late, capped at $10. */
export function lateFee(due: Date | null, returnedAt: Date): number {
  if (!due) return 0;
  return Math.min(FINE_CAP_CENTS, daysLate(due, returnedAt) * FINE_PER_DAY_CENTS);
}

export type RenewCheck = { ok: true } | { ok: false; error: string };

/** A loan can be renewed while not overdue, under the renewal limit, and with nobody queueing for the title. */
export function checkRenewal(loan: { dueDate: Date | null; renewCount: number }, now: Date, othersWaiting: number): RenewCheck {
  if (loan.renewCount >= MAX_RENEWALS) return { ok: false, error: `This loan has already been renewed ${MAX_RENEWALS} times.` };
  if (loan.dueDate && now > loan.dueDate) return { ok: false, error: "Overdue loans cannot be renewed. Return the book." };
  if (othersWaiting > 0) return { ok: false, error: "Someone is waiting for this title, so it cannot be renewed." };
  return { ok: true };
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

export function isLoanDays(n: number): boolean {
  return (LOAN_DAYS as readonly number[]).includes(n);
}
