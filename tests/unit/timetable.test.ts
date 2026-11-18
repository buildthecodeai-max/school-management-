import { describe, it, expect } from "vitest";
import { detectConflicts, type SlotInput } from "@/lib/timetable";

function slot(overrides: Partial<SlotInput> & Pick<SlotInput, "sectionId" | "subjectId" | "dayOfWeek" | "periodNumber">): SlotInput {
  return {
    staffId: null,
    roomId: null,
    ...overrides,
  };
}

describe("detectConflicts — staff, room, section conflicts", () => {
  it("returns empty for a slot with no conflicts", () => {
    const slots: SlotInput[] = [
      slot({ id: "s1", sectionId: "sec-a", subjectId: "math", staffId: "t1", roomId: "r1", dayOfWeek: "MON", periodNumber: 1 }),
      slot({ id: "s2", sectionId: "sec-b", subjectId: "english", staffId: "t2", roomId: "r2", dayOfWeek: "MON", periodNumber: 1 }),
    ];
    expect(detectConflicts(slots)).toHaveLength(0);
  });

  it("detects a staff double-booking on the same day+period", () => {
    const slots: SlotInput[] = [
      slot({ id: "s1", sectionId: "sec-a", subjectId: "math", staffId: "t1", dayOfWeek: "TUE", periodNumber: 2 }),
      slot({ id: "s2", sectionId: "sec-b", subjectId: "science", staffId: "t1", dayOfWeek: "TUE", periodNumber: 2 }),
    ];
    const result = detectConflicts(slots);
    expect(result.some((c) => c.type === "STAFF" && c.resourceId === "t1")).toBe(true);
  });

  it("detects a room double-booking", () => {
    const slots: SlotInput[] = [
      slot({ sectionId: "sec-a", subjectId: "math", roomId: "room-1", dayOfWeek: "WED", periodNumber: 3 }),
      slot({ sectionId: "sec-b", subjectId: "english", roomId: "room-1", dayOfWeek: "WED", periodNumber: 3 }),
    ];
    expect(detectConflicts(slots).some((c) => c.type === "ROOM")).toBe(true);
  });

  it("detects a section scheduled twice in the same period", () => {
    const slots: SlotInput[] = [
      slot({ sectionId: "sec-a", subjectId: "math", dayOfWeek: "THU", periodNumber: 1 }),
      slot({ sectionId: "sec-a", subjectId: "art", dayOfWeek: "THU", periodNumber: 1 }),
    ];
    expect(detectConflicts(slots).some((c) => c.type === "SECTION")).toBe(true);
  });

  it("does not flag conflicts across different periods", () => {
    const slots: SlotInput[] = [
      slot({ sectionId: "sec-a", subjectId: "math", staffId: "t1", roomId: "r1", dayOfWeek: "MON", periodNumber: 1 }),
      slot({ sectionId: "sec-a", subjectId: "english", staffId: "t1", roomId: "r1", dayOfWeek: "MON", periodNumber: 2 }),
    ];
    expect(detectConflicts(slots)).toHaveLength(0);
  });

  it("does not flag conflicts across different days", () => {
    const slots: SlotInput[] = [
      slot({ sectionId: "sec-a", subjectId: "math", staffId: "t1", roomId: "r1", dayOfWeek: "MON", periodNumber: 1 }),
      slot({ sectionId: "sec-a", subjectId: "math", staffId: "t1", roomId: "r1", dayOfWeek: "TUE", periodNumber: 1 }),
    ];
    expect(detectConflicts(slots)).toHaveLength(0);
  });

  it("does not conflict when staffId/roomId are null", () => {
    const slots: SlotInput[] = [
      slot({ sectionId: "sec-a", subjectId: "math", staffId: null, roomId: null, dayOfWeek: "FRI", periodNumber: 4 }),
      slot({ sectionId: "sec-b", subjectId: "art", staffId: null, roomId: null, dayOfWeek: "FRI", periodNumber: 4 }),
    ];
    expect(detectConflicts(slots)).toHaveLength(0);
  });

  it("can detect multiple conflicts simultaneously (staff + room)", () => {
    const slots: SlotInput[] = [
      slot({ id: "a", sectionId: "sec-a", subjectId: "math", staffId: "t1", roomId: "r1", dayOfWeek: "MON", periodNumber: 1 }),
      slot({ id: "b", sectionId: "sec-b", subjectId: "science", staffId: "t1", roomId: "r1", dayOfWeek: "MON", periodNumber: 1 }),
    ];
    const conflicts = detectConflicts(slots);
    const types = conflicts.map((c) => c.type);
    expect(types).toContain("STAFF");
    expect(types).toContain("ROOM");
  });
});

import { validTimes } from "@/lib/timetable";
describe("validTimes", () => {
  it("needs HH:MM 24h with end after start", () => {
    expect(validTimes("08:00", "08:45")).toBe(true);
    expect(validTimes("08:45", "08:00")).toBe(false);
    expect(validTimes("08:00", "08:00")).toBe(false);
    expect(validTimes("8:00", "09:00")).toBe(false);
    expect(validTimes("25:00", "26:00")).toBe(false);
  });
});
