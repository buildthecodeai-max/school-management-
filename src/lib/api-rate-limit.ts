import "server-only";

// A minimal in-memory sliding-window limiter (API-006). This is
// single-process only — fine for local/dev and for demonstrating the
// contract, but a multi-instance deployment needs a shared store (Redis)
// behind the same `checkRateLimit` signature.
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 120; // requests per window per API client

const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  clientId: string,
  limit: number = DEFAULT_LIMIT,
): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const hits = (buckets.get(clientId) ?? []).filter((t) => t > windowStart);

  const allowed = hits.length < limit;
  if (allowed) hits.push(now);
  buckets.set(clientId, hits);

  const oldest = hits[0] ?? now;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - hits.length),
    resetAt: oldest + WINDOW_MS,
  };
}

// Exposed for tests/scripts that want a clean slate between runs.
export function resetRateLimit(clientId: string): void {
  buckets.delete(clientId);
}
