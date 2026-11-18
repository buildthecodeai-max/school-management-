import { describe, it, expect } from "vitest";
import { isTripStatus, seatsLeft, canAssign } from "@/lib/transport";

describe("transport rules", () => {
  it("accepts only known trip statuses", () => {
    expect(isTripStatus("BOARDED")).toBe(true);
    expect(isTripStatus("boarded")).toBe(false);
    expect(isTripStatus(undefined)).toBe(false);
  });
  it("computes seats left and treats missing capacity as unlimited", () => {
    expect(seatsLeft(40, 38)).toBe(2);
    expect(seatsLeft(40, 45)).toBe(0);
    expect(seatsLeft(0, 5)).toBeNull();
    expect(seatsLeft(null, 5)).toBeNull();
    expect(canAssign(40, 40)).toBe(false);
    expect(canAssign(40, 39)).toBe(true);
    expect(canAssign(null, 99)).toBe(true);
  });
});
