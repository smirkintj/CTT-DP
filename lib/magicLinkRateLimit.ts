type Entry = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 5;
const buckets = new Map<string, Entry>();

export function canRequestMagicLink(key: string) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1;
  return true;
}
