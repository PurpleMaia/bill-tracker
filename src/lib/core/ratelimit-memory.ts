type Entry = { count: number; resetAt: number };

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

const buckets = new Map<string, Entry>();
const CLEANUP_INTERVAL_MS = 60_000;

function cleanStale(now: number) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

const cleanupTimer = setInterval(() => cleanStale(Date.now()), CLEANUP_INTERVAL_MS);
if (typeof cleanupTimer.unref === 'function') {
  cleanupTimer.unref();
}

export function limitFixedWindow(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  cleanStale(now);

  const entry = buckets.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  if (entry.count >= limit) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { ok: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

export function retryAfterMs(resetAt: number, now = Date.now()): number {
  return Math.max(0, resetAt - now);
}
