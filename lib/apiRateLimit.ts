/**
 * General-purpose API rate limiter (in-memory, per-IP sliding window).
 * Note: Resets on server restart. Sufficient for single-instance / low-traffic portals.
 * For multi-instance production, replace with Redis-backed limiter (e.g. @upstash/ratelimit).
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now - entry.windowStart > 60_000) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInMs: number;
}

/**
 * @param key      Unique identifier (e.g. IP address, user ID)
 * @param limit    Max requests allowed in the window
 * @param windowMs Time window in milliseconds (default 60s)
 */
export function checkRateLimit(key: string, limit: number, windowMs = 60_000): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, resetInMs: windowMs };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetInMs: windowMs - (now - entry.windowStart),
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetInMs: windowMs - (now - entry.windowStart),
  };
}
