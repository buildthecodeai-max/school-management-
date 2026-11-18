import { describe, it, expect } from "vitest";
import { parseLines, parseCents, isLow, canPoMove } from "@/lib/inventory";

describe("inventory rules", () => {
  it("parses and merges requisition lines", () => {
    const r = parseLines(JSON.stringify([{ itemId: "a", qty: 2 }, { itemId: "b", qty: 1 }, { itemId: "a", qty: 3 }]));
    expect(r).toEqual({ ok: true, lines: [{ itemId: "a", qty: 5 }, { itemId: "b", qty: 1 }] });
  });
  it("rejects bad lines", () => {
    expect(parseLines("nope").ok).toBe(false);
    expect(parseLines("[]").ok).toBe(false);
    expect(parseLines(JSON.stringify([{ itemId: "a", qty: 0 }])).ok).toBe(false);
    expect(parseLines(JSON.stringify([{ itemId: "a", qty: 1.5 }])).ok).toBe(false);
    expect(parseLines(JSON.stringify([{ itemId: "a", qty: -1 }])).ok).toBe(false);
    expect(parseLines(JSON.stringify([{ qty: 1 }])).ok).toBe(false);
    expect(parseLines(JSON.stringify([{ itemId: "a", qty: 60000 }, { itemId: "a", qty: 60000 }])).ok).toBe(false);
  });
  it("parses money strictly into cents", () => {
    expect(parseCents("12.50")).toBe(1250);
    expect(parseCents("0")).toBe(0);
    expect(parseCents("7")).toBe(700);
    expect(parseCents("1.234")).toBeNull();
    expect(parseCents("-1")).toBeNull();
    expect(parseCents("abc")).toBeNull();
    expect(parseCents("")).toBeNull();
  });
  it("flags low stock only when a threshold is set", () => {
    expect(isLow(5, 5)).toBe(true);
    expect(isLow(6, 5)).toBe(false);
    expect(isLow(0, 0)).toBe(false);
  });
  it("limits purchase order transitions", () => {
    expect(canPoMove("DRAFT", "SENT")).toBe(true);
    expect(canPoMove("RECEIVED", "CANCELLED")).toBe(false);
    expect(canPoMove("CANCELLED", "RECEIVED")).toBe(false);
  });
});
