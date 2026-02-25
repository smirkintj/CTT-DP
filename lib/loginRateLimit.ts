type RateLimitEntry = {
  attempts: number;
  blockedUntil: number | null;
};

const MAX_ATTEMPTS = 3;
const BLOCK_MS = 60_000;
const store = new Map<string, RateLimitEntry>();

function getEntry(key: string): RateLimitEntry {
  const existing = store.get(key);
  if (existing) return existing;
  const next: RateLimitEntry = { attempts: 0, blockedUntil: null };
  store.set(key, next);
  return next;
}

export function getRemainingBlockMs(key: string): number {
  const entry = getEntry(key);
  if (!entry.blockedUntil) return 0;
  const remaining = entry.blockedUntil - Date.now();
  if (remaining <= 0) {
    entry.blockedUntil = null;
    entry.attempts = 0;
    return 0;
  }
  return remaining;
}

export function recordLoginFailure(key: string) {
  const entry = getEntry(key);
  const remaining = getRemainingBlockMs(key);
  if (remaining > 0) return;
  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + BLOCK_MS;
    entry.attempts = 0;
  }
}

export function clearLoginFailures(key: string) {
  store.delete(key);
}
