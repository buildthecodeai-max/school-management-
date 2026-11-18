// Pure inventory rules (no DB).

export const MAX_QTY = 100_000;

export type Line = { itemId: string; qty: number };

/** Parse a JSON array of {itemId, qty}; qty must be a whole number 1..MAX_QTY. Duplicate items are merged. */
export function parseLines(raw: string): { ok: true; lines: Line[] } | { ok: false; error: string } {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { ok: false, error: "Could not read the lines." }; }
  if (!Array.isArray(data) || data.length === 0) return { ok: false, error: "Add at least one line." };
  const merged = new Map<string, number>();
  for (const l of data) {
    const itemId = typeof l?.itemId === "string" ? l.itemId : "";
    const qty = Number(l?.qty);
    if (!itemId) return { ok: false, error: "Every line needs an item." };
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { ok: false, error: `Quantities must be whole numbers from 1 to ${MAX_QTY}.` };
    merged.set(itemId, (merged.get(itemId) ?? 0) + qty);
  }
  const lines = [...merged].map(([itemId, qty]) => ({ itemId, qty }));
  if (lines.some((l) => l.qty > MAX_QTY)) return { ok: false, error: `Quantities must not exceed ${MAX_QTY}.` };
  return { ok: true, lines };
}

/** "12.50" -> 1250. Returns null for anything that is not a non-negative amount with at most 2 decimals. */
export function parseCents(input: unknown): number | null {
  const s = String(input ?? "").trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

export function isLow(stock: number, reorderThreshold: number): boolean {
  return reorderThreshold > 0 && stock <= reorderThreshold;
}

export const PO_NEXT: Record<string, string[]> = {
  DRAFT: ["SENT", "RECEIVED", "CANCELLED"],
  SENT: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};
export const canPoMove = (from: string, to: string) => (PO_NEXT[from] ?? []).includes(to);
