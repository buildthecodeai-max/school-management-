// Pure timetable conflict detection — no DB calls, fully unit-testable.
// A "conflict" is when a staff member or room is double-booked on the same
// day + period within a timetable version.

export type SlotInput = {
  id?: string;
  sectionId: string;
  subjectId: string;
  staffId?: string | null;
  roomId?: string | null;
  dayOfWeek: string;
  periodNumber: number;
};

export type ConflictType = "STAFF" | "ROOM" | "SECTION";

export type SlotConflict = {
  type: ConflictType;
  resourceId: string;
  dayOfWeek: string;
  periodNumber: number;
  conflictingSlotId?: string;
};

/**
 * Detect conflicts within a set of slots.
 * Returns an array of conflicts (empty = no conflicts).
 * Ignores slots with matching `id` when checking against themselves.
 */
export function detectConflicts(slots: SlotInput[]): SlotConflict[] {
  const conflicts: SlotConflict[] = [];

  // Group by day+period for O(n) comparison.
  const byPeriod = new Map<string, SlotInput[]>();
  for (const slot of slots) {
    const key = `${slot.dayOfWeek}:${slot.periodNumber}`;
    const bucket = byPeriod.get(key) ?? [];
    bucket.push(slot);
    byPeriod.set(key, bucket);
  }

  for (const [, bucket] of byPeriod) {
    // Returns true only when both ids are defined and identical — prevents a
    // slot from being counted as conflicting with itself.
    const sameSlot = (a: SlotInput, b: SlotInput) =>
      a.id !== undefined && b.id !== undefined && a.id === b.id;

    // Section double-booked in same period
    const sections = new Map<string, SlotInput>();
    for (const slot of bucket) {
      const existing = sections.get(slot.sectionId);
      if (existing && !sameSlot(existing, slot)) {
        conflicts.push({
          type: "SECTION",
          resourceId: slot.sectionId,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          conflictingSlotId: existing.id,
        });
      } else {
        sections.set(slot.sectionId, slot);
      }
    }

    // Staff double-booked
    const staffMap = new Map<string, SlotInput>();
    for (const slot of bucket) {
      if (!slot.staffId) continue;
      const existing = staffMap.get(slot.staffId);
      if (existing && !sameSlot(existing, slot)) {
        conflicts.push({
          type: "STAFF",
          resourceId: slot.staffId,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          conflictingSlotId: existing.id,
        });
      } else {
        staffMap.set(slot.staffId, slot);
      }
    }

    // Room double-booked
    const roomMap = new Map<string, SlotInput>();
    for (const slot of bucket) {
      if (!slot.roomId) continue;
      const existing = roomMap.get(slot.roomId);
      if (existing && !sameSlot(existing, slot)) {
        conflicts.push({
          type: "ROOM",
          resourceId: slot.roomId,
          dayOfWeek: slot.dayOfWeek,
          periodNumber: slot.periodNumber,
          conflictingSlotId: existing.id,
        });
      } else {
        roomMap.set(slot.roomId, slot);
      }
    }
  }

  return conflicts;
}
