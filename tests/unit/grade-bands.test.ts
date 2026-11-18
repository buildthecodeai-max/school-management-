import { describe, it, expect } from "vitest";
import { DEFAULT_BANDS, parseBands } from "@/lib/grade-bands";

describe("grade band parser", () => {
  it("parses the default scale", () => {
    const r = parseBands(DEFAULT_BANDS);
    expect(r.error).toBeUndefined();
    expect(r.bands).toHaveLength(5);
    expect(r.bands![0]).toEqual({ grade: "A", minPercent: 80, gradePoint: 4, isPass: true });
    expect(r.bands!.at(-1)).toMatchObject({ grade: "F", minPercent: 0, isPass: false });
  });

  it.each([
    ["A, 90, 4\nB, 50", "0%"],
    ["A, 90, 4\nA, 0, 0", "only once"],
    ["A, 50, 4\nB, 50, 3\nC, 0, 0", "same percentage"],
    ["A, 120, 4\nB, 0, 0", "0-100"],
    ["A, x, 4\nB, 0, 0", "0-100"],
    ["A, 0, 4", "two bands"],
  ])("rejects %j", (text, msg) => {
    expect(parseBands(text).error?.toLowerCase()).toContain(msg.toLowerCase());
  });

  it("treats anything but 'fail' as a pass and tolerates blank lines and missing points", () => {
    const r = parseBands("\nA, 50\n\nF, 0, 0, FAIL\n");
    expect(r.bands).toEqual([
      { grade: "A", minPercent: 50, gradePoint: 0, isPass: true },
      { grade: "F", minPercent: 0, gradePoint: 0, isPass: false },
    ]);
  });
});
