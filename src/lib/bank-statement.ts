// Pure bank-statement parsing and matching rules (no DB).
import { createHash } from "crypto";

export type StatementRow = {
  transactionDate: Date;
  reference: string | null;
  description: string | null;
  amountCents: number;
  currency: string;
  dedupeKey: string;
};
export type ParseResult = { rows: StatementRow[]; errors: { line: number; message: string }[] };

export const MAX_STATEMENT_ROWS = 5000;

/** RFC-4180 style CSV: quoted fields, escaped quotes, commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) out.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) out.push(row);
  return out;
}

/** ISO yyyy-mm-dd only: other formats are ambiguous (day/month) and are rejected with a clear message. */
export function parseIsoDate(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

/** "1,234.50" or "-12.5" -> cents; null if not an amount with at most 2 decimals. */
export function parseAmountCents(v: string): number | null {
  const s = v.trim().replace(/^\+/, "");
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace(/^-/, "").replace(/,/g, "").split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return neg ? -cents : cents;
}

const HEAD: Record<string, string[]> = {
  date: ["date", "transactiondate", "transaction date", "value date", "posting date"],
  reference: ["reference", "ref", "reference number", "narrative ref"],
  description: ["description", "details", "narrative", "memo"],
  amount: ["amount", "credit amount", "value"],
  currency: ["currency", "ccy"],
};

export function parseStatement(text: string, defaultCurrency = "USD"): ParseResult {
  const table = parseCsv(text);
  const errors: ParseResult["errors"] = [];
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: "The file is empty." }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (k: string) => header.findIndex((h) => HEAD[k].includes(h));
  const idx = { date: col("date"), reference: col("reference"), description: col("description"), amount: col("amount"), currency: col("currency") };
  if (idx.date < 0 || idx.amount < 0) return { rows: [], errors: [{ line: 1, message: "The header row needs a 'date' and an 'amount' column." }] };
  if (table.length - 1 > MAX_STATEMENT_ROWS) return { rows: [], errors: [{ line: 1, message: `A statement can have at most ${MAX_STATEMENT_ROWS} lines.` }] };

  const seen = new Map<string, number>();
  const rows: StatementRow[] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (k: keyof typeof idx) => (idx[k] >= 0 ? (cells[idx[k]] ?? "").trim() : "");
    const date = parseIsoDate(get("date"));
    if (!date) return void errors.push({ line, message: `Date "${get("date")}" must be written yyyy-mm-dd.` });
    const amountCents = parseAmountCents(get("amount"));
    if (amountCents === null) return void errors.push({ line, message: `Amount "${get("amount")}" is not a valid amount.` });
    if (amountCents === 0) return void errors.push({ line, message: "Amount cannot be zero." });
    const reference = get("reference") || null;
    const description = get("description") || null;
    const currency = (get("currency") || defaultCurrency).toUpperCase().slice(0, 3);
    // Identical lines in one file are legitimate (two equal deposits), so number the repeats.
    const base = [date.toISOString().slice(0, 10), amountCents, currency, reference ?? "", description ?? ""].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    rows.push({ transactionDate: date, reference, description, amountCents, currency, dedupeKey: createHash("sha256").update(`${base}#${n}`).digest("hex").slice(0, 40) });
  });
  return { rows, errors };
}

export type Candidate = { id: string; number: string; reference: string | null; amount: number; receivedAt: Date };
export type MatchOutcome = { kind: "match"; paymentId: string; why: "reference" | "unique" } | { kind: "ambiguous"; candidateIds: string[] } | { kind: "none" };

const DAY = 86_400_000;
export const MATCH_WINDOW_DAYS = 3;

/**
 * Decide how to match one credit line. A payment qualifies on equal amount and a
 * date within the window. A reference that appears in the narrative wins; else a
 * single qualifying payment matches; several qualifying payments are left for a
 * human, never guessed.
 */
export function matchLine(line: { amountCents: number; transactionDate: Date; reference: string | null; description: string | null }, payments: Candidate[]): MatchOutcome {
  if (line.amountCents <= 0) return { kind: "none" };
  const near = payments.filter((p) => p.amount === line.amountCents && Math.abs(p.receivedAt.getTime() - line.transactionDate.getTime()) <= MATCH_WINDOW_DAYS * DAY);
  if (near.length === 0) return { kind: "none" };
  const hay = `${line.reference ?? ""} ${line.description ?? ""}`.toLowerCase();
  const byRef = near.filter((p) => [p.reference, p.number].some((r) => r && r.length >= 4 && hay.includes(r.toLowerCase())));
  if (byRef.length === 1) return { kind: "match", paymentId: byRef[0].id, why: "reference" };
  if (byRef.length > 1) return { kind: "ambiguous", candidateIds: byRef.map((p) => p.id) };
  if (near.length === 1) return { kind: "match", paymentId: near[0].id, why: "unique" };
  return { kind: "ambiguous", candidateIds: near.map((p) => p.id) };
}
