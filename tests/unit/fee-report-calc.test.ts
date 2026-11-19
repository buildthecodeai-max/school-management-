import { describe, it, expect } from "vitest";
import { agingBucket, daysOverdue, plainMoney, sumBy, localDayKey } from "@/lib/fee-report-calc";

const d = (s: string) => new Date(`${s}T12:00:00`);

describe("fee report calculations", () => {
  it("buckets invoices by days overdue", () => {
    const now = d("2026-06-30");
    expect(agingBucket(d("2026-07-05"), now)).toBe("Current");
    expect(agingBucket(d("2026-06-30"), now)).toBe("Current");
    expect(agingBucket(d("2026-06-20"), now)).toBe("1–30 days");
    expect(agingBucket(d("2026-05-20"), now)).toBe("31–60 days");
    expect(agingBucket(d("2026-04-20"), now)).toBe("61–90 days");
    expect(agingBucket(d("2026-01-01"), now)).toBe("90+ days");
    expect(daysOverdue(d("2026-06-20"), now)).toBe(10);
  });
  it("formats cents as plain decimals", () => {
    expect(plainMoney(123450)).toBe("1234.50");
    expect(plainMoney(5)).toBe("0.05");
    expect(plainMoney(0)).toBe("0.00");
    expect(plainMoney(-250)).toBe("-2.50");
  });
  it("sums by key", () => {
    const rows = [{ m: "CASH", a: 100 }, { m: "BANK", a: 50 }, { m: "CASH", a: 25 }];
    expect(sumBy(rows, (r) => r.m, (r) => r.a)).toEqual([{ key: "CASH", total: 125, count: 2 }, { key: "BANK", total: 50, count: 1 }]);
  });
  it("makes local day keys", () => {
    expect(localDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
