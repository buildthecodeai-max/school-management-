// SEC-003: In-memory login rate limiting. Same pattern and limitations as
// api-rate-limit.ts — resets on server restart, not shared across replicas.
// Sufficient for single-node deployment; document for production upgrade.

const WINDOW_MS = 15 * 60 * 1000; // 15-minute window
const MAX_ATTEMPTS = 10; // per identifier

type Entry = { count: number; windowStart: number };
const store = new Map<string, Entry>();

export function checkLoginRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(identifier, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMs: 0 };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, retryAfterMs: 0 };
}

export function resetLoginRateLimit(identifier: string): void {
  store.delete(identifier);
}
