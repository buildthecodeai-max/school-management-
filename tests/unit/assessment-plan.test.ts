import { describe, it, expect } from "vitest";
import { DEFAULT_COMPONENTS, parseComponents } from "@/lib/assessment-plan";

describe("assessment component parser", () => {
  it("parses the default and requires weights to total 100", () => {
    const r = parseComponents(DEFAULT_COMPONENTS);
    expect(r.error).toBeUndefined();
    expect(r.components).toEqual([
      { name: "Class tests", weight: 20, maxMarks: 20 },
      { name: "Midterm exam", weight: 30, maxMarks: 100 },
      { name: "Final exam", weight: 50, maxMarks: 100 },
    ]);
  });
  it.each([
    ["A, 50, 10\nB, 40, 10", "total 100"],
    ["A, 60, 10\nB, 60, 10", "total 100"],
    ["A, 100, 0", "maximum marks"],
    ["A, 50.5, 10\nB, 49.5, 10", "whole-number"],
    ["A, 50, 10\na, 50, 10", "different"],
    ["", "at least one"],
    ["A, x, 10", "whole-number"],
  ])("rejects %j", (text, msg) => expect(parseComponents(text).error?.toLowerCase()).toContain(msg));
});
