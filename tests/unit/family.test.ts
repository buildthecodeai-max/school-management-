import { describe, it, expect } from "vitest";
import { feeVisibility } from "@/lib/family";

describe("family fee visibility", () => {
  it("shows fees to the paying or primary guardian only", () => {
    expect(feeVisibility({ financiallyResponsible: true, isPrimaryContact: false })).toBe(true);
    expect(feeVisibility({ financiallyResponsible: false, isPrimaryContact: true })).toBe(true);
    expect(feeVisibility({ financiallyResponsible: false, isPrimaryContact: false })).toBe(false);
    expect(feeVisibility(null)).toBe(false);
  });
});
