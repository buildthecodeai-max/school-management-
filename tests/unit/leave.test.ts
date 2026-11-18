import { describe, it, expect } from "vitest";
import { daysBetweenInclusive, rangesOverlap, remainingDays, validDaysRequested } from "@/lib/leave";

const d = (s: string) => new Date(s);
describe("leave helpers", () => {
  it("counts inclusive calendar days", () => {
    expect(daysBetweenInclusive(d("2026-03-02"), d("2026-03-02"))).toBe(1);
    expect(daysBetweenInclusive(d("2026-03-02"), d("2026-03-06"))).toBe(5);
  });
  it("detects overlapping ranges, including touching ends", () => {
    expect(rangesOverlap(d("2026-03-01"), d("2026-03-05"), d("2026-03-05"), d("2026-03-09"))).toBe(true);
    expect(rangesOverlap(d("2026-03-01"), d("2026-03-05"), d("2026-03-06"), d("2026-03-09"))).toBe(false);
  });
  it("computes remaining days; 0 entitlement means untracked", () => {
    expect(remainingDays(21, 5, 2)).toBe(14);
    expect(remainingDays(10, 12, 0)).toBe(0);
    expect(remainingDays(0, 99, 0)).toBeNull();
  });
  it("validates the requested days", () => {
    expect(validDaysRequested(2, 5)).toBeNull();
    expect(validDaysRequested(0.5, 1)).toBeNull();
    expect(validDaysRequested(0, 5)).toMatch(/how many/);
    expect(validDaysRequested(1.3, 5)).toMatch(/half/);
    expect(validDaysRequested(6, 5)).toMatch(/more than 5/);
    expect(validDaysRequested(NaN, 5)).toMatch(/how many/);
  });
});
