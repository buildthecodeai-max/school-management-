// Money is stored everywhere as integer minor units (cents) to avoid floating
// point drift in financial totals (NFR-005). Format only at the edges.

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// Parse a user-entered decimal amount (e.g. "125.50") into integer cents.
export function toCents(input: string | number): number {
  const n = typeof input === "number" ? input : parseFloat(input);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}
