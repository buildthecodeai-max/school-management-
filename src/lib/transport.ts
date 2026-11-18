// Pure transport rules.

export const TRIP_STATUSES = ["BOARDED", "ABSENT", "LATE"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export function isTripStatus(v: unknown): v is TripStatus {
  return typeof v === "string" && (TRIP_STATUSES as readonly string[]).includes(v);
}

/** Seats still free on a vehicle; no vehicle (or capacity 0) means "no limit set". */
export function seatsLeft(capacity: number | null | undefined, assigned: number): number | null {
  if (!capacity || capacity <= 0) return null;
  return Math.max(0, capacity - assigned);
}

export function canAssign(capacity: number | null | undefined, assigned: number): boolean {
  const left = seatsLeft(capacity, assigned);
  return left === null || left > 0;
}
