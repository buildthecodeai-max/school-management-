import { expect, it } from "vitest";
import { reportCsv, reportDates } from "@/lib/report-format";
it("includes the entire final UTC day", () => {
  expect(reportDates("2026-09-01", "2026-09-30")).toEqual({ gte: new Date("2026-09-01T00:00:00Z"), lt: new Date("2026-10-01T00:00:00Z") });
});
it("rejects impossible and reversed dates", () => {
  expect(() => reportDates("2026-02-30")).toThrow();
  expect(() => reportDates("2026-10-01", "2026-09-01")).toThrow();
});
it("escapes CSV quotes and prevents spreadsheet formulas", () => {
  expect(reportCsv([['A,"B"', '=HYPERLINK("bad")', '1250']])).toContain('"A,""B""","\'=HYPERLINK(""bad"")","1250"');
});
