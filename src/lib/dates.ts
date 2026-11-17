// Normalize a date to the start of its day (local). Attendance registers are
// keyed by day, so all session dates are stored at midnight for a stable
// unique key (sectionId, date, period).
export function dayStart(d: Date = new Date()): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function dayEnd(d: Date = new Date()): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

export function isoDay(d: Date = new Date()): string {
  return dayStart(d).toISOString().slice(0, 10);
}
