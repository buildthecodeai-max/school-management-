import { describe, it, expect } from "vitest";
import { parseDay, formatDay, checkRegisterDate, attendancePct, diffMarks, addToTally, emptyTally } from "@/lib/attendance";

describe("attendance helpers", () => {
  it("parses only real calendar days", () => {
    expect(formatDay(parseDay("2026-03-05")!)).toBe("2026-03-05");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("05/03/2026")).toBeNull();
    expect(parseDay(null)).toBeNull();
  });
  it("blocks future dates and old dates without amend rights", () => {
    const today = parseDay("2026-03-10")!;
    expect(checkRegisterDate(parseDay("2026-03-11")!, today, true).ok).toBe(false);
    expect(checkRegisterDate(parseDay("2026-03-10")!, today, false).ok).toBe(true);
    expect(checkRegisterDate(parseDay("2026-03-03")!, today, false).ok).toBe(true);
    expect(checkRegisterDate(parseDay("2026-03-02")!, today, false).ok).toBe(false);
    expect(checkRegisterDate(parseDay("2026-03-02")!, today, true).ok).toBe(true);
  });
  it("computes percentages", () => {
    expect(attendancePct(0, 0)).toBeNull();
    expect(attendancePct(17, 20)).toBe(85);
    expect(attendancePct(1, 3)).toBe(33.3);
  });
  it("diffs marks, ignoring blanks and unchanged", () => {
    expect(diffMarks({ a: "P", b: "A" }, { a: "P", b: "L", c: "P", d: "" })).toEqual([
      { studentId: "b", fromCodeId: "A", toCodeId: "L" },
      { studentId: "c", fromCodeId: null, toCodeId: "P" },
    ]);
  });
  it("tallies by category", () => {
    const t = emptyTally();
    addToTally(t, "PRESENT"); addToTally(t, "ABSENT"); addToTally(t, "LATE");
    expect(t).toMatchObject({ present: 1, absent: 1, late: 1, total: 3 });
  });
});
