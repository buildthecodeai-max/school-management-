import "server-only";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

// Consistent success/error envelopes and pagination (API-004/006) across
// every /api/v1 route. Every response carries a correlation id — either the
// caller's own `X-Correlation-Id` header or a freshly generated one — so a
// support engineer can trace one call through logs and audit events.

export function correlationIdFor(request: Request): string {
  return request.headers.get("x-correlation-id") || randomUUID();
}

export function apiError(
  status: number,
  code: string,
  message: string,
  correlationId: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, correlationId, ...extra } },
    { status, headers: { "X-Correlation-Id": correlationId } },
  );
}

export function apiOk(
  data: unknown,
  correlationId: string,
  status = 200,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { data, meta: { correlationId } },
    { status, headers: { "X-Correlation-Id": correlationId, ...extraHeaders } },
  );
}

export interface PageParams {
  limit: number;
  cursor?: string;
}

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;

// Bounded, cursor-friendly pagination params from a URL's query string
// (API-004). `cursor` is treated as an opaque id — callers use it as
// `{ id: { gt: cursor } }` combined with a stable orderBy.
export function parsePageParams(url: URL): PageParams {
  const rawLimit = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(MAX_LIMIT, Math.floor(rawLimit))
      : DEFAULT_LIMIT;
  const cursor = url.searchParams.get("cursor") || undefined;
  return { limit, cursor };
}

export function apiList(
  items: { id: string }[],
  limit: number,
  correlationId: string,
): NextResponse {
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? page[page.length - 1]?.id : null;
  return NextResponse.json(
    { data: page, meta: { correlationId, nextCursor, count: page.length } },
    { status: 200, headers: { "X-Correlation-Id": correlationId } },
  );
}

// API-004: ?sort=field:asc|desc — returns a Prisma-compatible orderBy object
// when the field is in the allowedFields set, otherwise returns the fallback.
export function parseSortParam(
  url: URL,
  allowedFields: string[],
  fallback: Record<string, "asc" | "desc"> = { id: "asc" },
): Record<string, "asc" | "desc"> {
  const raw = url.searchParams.get("sort");
  if (!raw) return fallback;
  const [field, dir] = raw.split(":");
  if (!allowedFields.includes(field)) return fallback;
  if (dir !== "asc" && dir !== "desc") return fallback;
  return { [field]: dir };
}

// API-004: ?fields=a,b,c — strips all keys from an item that are not in the
// requested field list. When ?fields is absent every key is kept.
export function applyFields<T extends object>(item: T, url: URL): Partial<T> {
  const raw = url.searchParams.get("fields");
  if (!raw) return item;
  const keep = new Set(raw.split(",").map((f) => f.trim()).filter(Boolean));
  return Object.fromEntries(
    Object.entries(item).filter(([k]) => keep.has(k)),
  ) as Partial<T>;
}
