import { describe, it, expect } from "vitest";
import { lateFee, daysLate, checkRenewal, isLoanDays, addDays } from "@/lib/library";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("library rules", () => {
  it("charges 25c per full day late, capped at $10, nothing when on time", () => {
    expect(lateFee(d("2026-03-10"), d("2026-03-10"))).toBe(0);
    expect(lateFee(d("2026-03-10"), d("2026-03-09"))).toBe(0);
    expect(lateFee(d("2026-03-10"), d("2026-03-14"))).toBe(100);
    expect(lateFee(d("2026-03-10"), d("2026-06-10"))).toBe(1000);
    expect(lateFee(null, d("2026-03-10"))).toBe(0);
    expect(daysLate(d("2026-03-10"), d("2026-03-12"))).toBe(2);
  });
  it("limits renewals", () => {
    const now = d("2026-03-05");
    const loan = { dueDate: d("2026-03-10"), renewCount: 0 };
    expect(checkRenewal(loan, now, 0).ok).toBe(true);
    expect(checkRenewal({ ...loan, renewCount: 2 }, now, 0).ok).toBe(false);
    expect(checkRenewal({ ...loan, dueDate: d("2026-03-01") }, now, 0).ok).toBe(false);
    expect(checkRenewal(loan, now, 1).ok).toBe(false);
  });
  it("whitelists loan periods and adds days", () => {
    expect(isLoanDays(14)).toBe(true);
    expect(isLoanDays(0)).toBe(false);
    expect(isLoanDays(365)).toBe(false);
    expect(addDays(d("2026-03-30"), 3).getDate()).toBe(2);
  });
});
