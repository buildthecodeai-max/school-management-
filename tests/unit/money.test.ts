import { describe, it, expect } from "vitest";
import { formatMoney, toCents } from "@/lib/money";

describe("toCents", () => {
  it("converts a decimal string to integer cents", () => {
    expect(toCents("125.50")).toBe(12550);
  });

  it("rounds fractional cents rather than truncating", () => {
    // 10.005 -> 1000.5 cents -> rounds to 1001 (banker's-rounding-free, just
    // Math.round semantics, but this pins the exact behavior).
    expect(toCents("10.005")).toBe(1001);
  });

  it("handles a plain integer amount", () => {
    expect(toCents("50")).toBe(5000);
  });

  it("accepts a number directly, not just a string", () => {
    expect(toCents(9.99)).toBe(999);
  });

  it("treats invalid input as zero rather than throwing", () => {
    expect(toCents("not a number")).toBe(0);
    expect(toCents("")).toBe(0);
  });

  it("never produces floating point drift for typical fee amounts", () => {
    // The classic 0.1 + 0.2 !== 0.3 trap — cents math must not inherit it.
    expect(toCents("0.10") + toCents("0.20")).toBe(30);
  });
});

describe("formatMoney", () => {
  it("formats cents as a USD currency string", () => {
    expect(formatMoney(12550)).toBe("$125.50");
  });

  it("formats zero correctly", () => {
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("formats a different currency when given one", () => {
    expect(formatMoney(12550, "EUR")).toMatch(/125\.50/);
  });

  it("round-trips with toCents for whole-dollar and fractional amounts", () => {
    expect(formatMoney(toCents("42.00"))).toBe("$42.00");
    expect(formatMoney(toCents("1650.00"))).toBe("$1,650.00");
  });
});
