import { describe, it, expect } from "vitest";
import {
  subjectPercent,
  gradeForPercent,
  round1,
  computeResults,
  type Band,
  type Component,
  type Mark,
} from "@/lib/exams";

const BANDS: Band[] = [
  { grade: "A", minPercent: 80, gradePoint: 4, isPass: true },
  { grade: "B", minPercent: 65, gradePoint: 3, isPass: true },
  { grade: "C", minPercent: 50, gradePoint: 2, isPass: true },
  { grade: "D", minPercent: 40, gradePoint: 1, isPass: true },
  { grade: "F", minPercent: 0, gradePoint: 0, isPass: false },
];

const COMPONENTS: Component[] = [
  { id: "midterm", weight: 40, maxMarks: 100 },
  { id: "final", weight: 60, maxMarks: 100 },
];

describe("subjectPercent", () => {
  it("computes a straightforward weighted average", () => {
    const marks: Mark[] = [
      { componentId: "midterm", marks: 80, status: "NORMAL" },
      { componentId: "final", marks: 60, status: "NORMAL" },
    ];
    // 80*0.4 + 60*0.6 = 32 + 36 = 68
    expect(subjectPercent(COMPONENTS, marks)).toBeCloseTo(68, 5);
  });

  it("treats a missing mark as zero for that component", () => {
    const marks: Mark[] = [{ componentId: "midterm", marks: 80, status: "NORMAL" }];
    // final missing -> counts as 0: 80*0.4 + 0*0.6 = 32
    expect(subjectPercent(COMPONENTS, marks)).toBeCloseTo(32, 5);
  });

  it("treats ABSENT as zero marks but still counts its weight", () => {
    const marks: Mark[] = [
      { componentId: "midterm", marks: null, status: "ABSENT" },
      { componentId: "final", marks: 90, status: "NORMAL" },
    ];
    // 0*0.4 + 90*0.6 = 54
    expect(subjectPercent(COMPONENTS, marks)).toBeCloseTo(54, 5);
  });

  it("drops EXEMPT components from both numerator and denominator", () => {
    const marks: Mark[] = [
      { componentId: "midterm", marks: null, status: "EXEMPT" },
      { componentId: "final", marks: 90, status: "NORMAL" },
    ];
    // only final counts, weight-normalized: 90*0.6 / 0.6 = 90
    expect(subjectPercent(COMPONENTS, marks)).toBeCloseTo(90, 5);
  });

  it("returns 0 when every component is exempt (no denominator collapse/NaN)", () => {
    const marks: Mark[] = [
      { componentId: "midterm", marks: null, status: "EXEMPT" },
      { componentId: "final", marks: null, status: "EXEMPT" },
    ];
    expect(subjectPercent(COMPONENTS, marks)).toBe(0);
  });
});

describe("gradeForPercent", () => {
  it("picks the highest band the percent qualifies for", () => {
    expect(gradeForPercent(BANDS, 85)?.grade).toBe("A");
    expect(gradeForPercent(BANDS, 80)?.grade).toBe("A"); // boundary is inclusive
    expect(gradeForPercent(BANDS, 79.9)?.grade).toBe("B");
    expect(gradeForPercent(BANDS, 50)?.grade).toBe("C");
    expect(gradeForPercent(BANDS, 0)?.grade).toBe("F");
  });

  it("is order-independent — an unsorted band list still resolves correctly", () => {
    const shuffled = [BANDS[2], BANDS[0], BANDS[4], BANDS[1], BANDS[3]];
    expect(gradeForPercent(shuffled, 85)?.grade).toBe("A");
    expect(gradeForPercent(shuffled, 10)?.grade).toBe("F");
  });

  it("returns null when no band's threshold is met (should not happen with a 0% floor band)", () => {
    expect(gradeForPercent([{ grade: "A", minPercent: 90, gradePoint: 4, isPass: true }], 50)).toBeNull();
  });
});

describe("round1", () => {
  it("rounds to one decimal place", () => {
    expect(round1(67.649999)).toBe(67.6);
    expect(round1(67.65)).toBe(67.7);
    expect(round1(100)).toBe(100);
  });
});

describe("computeResults — ranking and promotion", () => {
  const subjects = [{ id: "math", name: "Mathematics" }];

  function marksMap(entries: [string, number][]): Map<string, Mark[]> {
    const m = new Map<string, Mark[]>();
    for (const [studentId, score] of entries) {
      m.set(`${studentId}:math`, [
        { componentId: "midterm", marks: score, status: "NORMAL" },
        { componentId: "final", marks: score, status: "NORMAL" },
      ]);
    }
    return m;
  }

  it("ranks students by overall percent, highest first", () => {
    const marksBy = marksMap([
      ["s1", 60],
      ["s2", 90],
      ["s3", 75],
    ]);
    const results = computeResults({
      bands: BANDS,
      components: COMPONENTS,
      subjects,
      students: ["s1", "s2", "s3"],
      marksBy,
    });
    const byId = Object.fromEntries(results.map((r) => [r.studentId, r]));
    expect(byId.s2.rank).toBe(1);
    expect(byId.s3.rank).toBe(2);
    expect(byId.s1.rank).toBe(3);
  });

  it("gives tied students the same rank and skips the next (1, 2, 2, 4)", () => {
    const marksBy = marksMap([["a", 90], ["b", 70], ["c", 70], ["d", 50]]);
    const results = computeResults({ bands: BANDS, components: COMPONENTS, subjects, students: ["a", "b", "c", "d"], marksBy });
    const rank = Object.fromEntries(results.map((r) => [r.studentId, r.rank]));
    expect(rank).toEqual({ a: 1, b: 2, c: 2, d: 4 });
  });

  it("marks a student below the lowest passing band as not passed", () => {
    const marksBy = marksMap([["s1", 20]]); // below D's 40% floor -> F
    const [result] = computeResults({
      bands: BANDS,
      components: COMPONENTS,
      subjects,
      students: ["s1"],
      marksBy,
    });
    expect(result.overallGrade).toBe("F");
    expect(result.passed).toBe(false);
  });

  it("marks a student at or above the lowest passing band as passed", () => {
    const marksBy = marksMap([["s1", 40]]);
    const [result] = computeResults({
      bands: BANDS,
      components: COMPONENTS,
      subjects,
      students: ["s1"],
      marksBy,
    });
    expect(result.overallGrade).toBe("D");
    expect(result.passed).toBe(true);
  });

  it("produces a reproducible result — same inputs, same output every time", () => {
    const marksBy = marksMap([
      ["s1", 55],
      ["s2", 82],
    ]);
    const input = { bands: BANDS, components: COMPONENTS, subjects, students: ["s1", "s2"], marksBy };
    const run1 = computeResults(input);
    const run2 = computeResults(input);
    expect(run1).toEqual(run2);
  });
});

import { canTransition } from "@/lib/exams";
describe("plan status transitions", () => {
  it("only allows the review workflow, never a direct jump to PUBLISHED", () => {
    expect(canTransition("OPEN", "SUBMITTED")).toBe(true);
    expect(canTransition("OPEN", "APPROVED")).toBe(false);
    expect(canTransition("OPEN", "PUBLISHED")).toBe(false);
    expect(canTransition("SUBMITTED", "APPROVED")).toBe(true);
    expect(canTransition("APPROVED", "PUBLISHED")).toBe(false);
    expect(canTransition("PUBLISHED", "OPEN")).toBe(true);
    expect(canTransition("PUBLISHED", "SUBMITTED")).toBe(false);
    expect(canTransition("OPEN", "BOGUS")).toBe(false);
  });
});
