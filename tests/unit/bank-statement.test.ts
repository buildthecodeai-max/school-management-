import { describe, it, expect } from "vitest";
import { parseCsv, parseAmountCents, parseIsoDate, parseStatement, matchLine } from "@/lib/bank-statement";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("bank statement parsing", () => {
  it("parses quoted fields, embedded commas/quotes and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'he said "hi"']]);
  });
  it("parses amounts strictly", () => {
    expect(parseAmountCents("1,234.50")).toBe(123450);
    expect(parseAmountCents("-12.5")).toBe(-1250);
    expect(parseAmountCents("100")).toBe(10000);
    expect(parseAmountCents("1.234")).toBeNull();
    expect(parseAmountCents("12,34")).toBeNull();
    expect(parseAmountCents("abc")).toBeNull();
  });
  it("accepts only ISO dates", () => {
    expect(parseIsoDate("2026-03-05")).not.toBeNull();
    expect(parseIsoDate("05/03/2026")).toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
  });
  it("reads a statement, reports bad lines by number, and numbers identical lines", () => {
    const csv = ['Date,Reference,Description,Amount', '2026-03-05,TX1,"Fees, Ann",1000.00', '2026-03-05,TX1,"Fees, Ann",1000.00', '05/03/2026,TX2,x,5', '2026-03-06,TX3,y,abc'].join("\n");
    const r = parseStatement(csv);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].dedupeKey).not.toBe(r.rows[1].dedupeKey);
    expect(r.rows[0].description).toBe("Fees, Ann");
    expect(r.errors.map((e) => e.line)).toEqual([4, 5]);
    // the same file parses to the same keys (re-import is a no-op)
    expect(parseStatement(csv).rows.map((x) => x.dedupeKey)).toEqual(r.rows.map((x) => x.dedupeKey));
  });
  it("needs date and amount columns", () => {
    expect(parseStatement("a,b\n1,2").errors[0].message).toMatch(/date.*amount/i);
    expect(parseStatement("").errors[0].message).toMatch(/empty/i);
  });
});

describe("matching bank lines to payments", () => {
  const line = { amountCents: 50000, transactionDate: d("2026-03-10"), reference: "FT123", description: "School fees" };
  const pay = (id: string, over: Partial<{ reference: string | null; amount: number; receivedAt: Date; number: string }> = {}) => ({ id, number: "RCP-000001", reference: null, amount: 50000, receivedAt: d("2026-03-09"), ...over });
  it("matches a single payment on amount and date", () => {
    expect(matchLine(line, [pay("p1")])).toEqual({ kind: "match", paymentId: "p1", why: "unique" });
  });
  it("prefers a reference found in the narrative", () => {
    expect(matchLine(line, [pay("p1"), pay("p2", { reference: "FT123" })])).toEqual({ kind: "match", paymentId: "p2", why: "reference" });
  });
  it("never guesses between several equal candidates", () => {
    expect(matchLine(line, [pay("p1"), pay("p2")])).toEqual({ kind: "ambiguous", candidateIds: ["p1", "p2"] });
  });
  it("respects amount, window and credit-only", () => {
    expect(matchLine(line, [pay("p1", { amount: 49999 })]).kind).toBe("none");
    expect(matchLine(line, [pay("p1", { receivedAt: d("2026-03-20") })]).kind).toBe("none");
    expect(matchLine({ ...line, amountCents: -50000 }, [pay("p1", { amount: -50000 })]).kind).toBe("none");
  });
});
