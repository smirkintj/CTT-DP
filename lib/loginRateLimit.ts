const LOCK_WINDOW_MS = 60_000;   // rolling window for counting failures
const MAX_FAILURES = 5;           // failures within window before lockout
export const LOGIN_LOCK_MS = 30_000; // lockout duration

type FailureRecord = { count: number; firstAt: number; lockedUntil: number };
const failures = new Map<string, FailureRecord>();

export function getRemainingBlockMs(key: string): number {
  const rec = failures.get(key);
  if (!rec) return 0;
  const remaining = rec.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const rec = failures.get(key) ?? { count: 0, firstAt: now, lockedUntil: 0 };
  // Reset window if first failure is older than the rolling window
  if (now - rec.firstAt > LOCK_WINDOW_MS) {
    failures.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= MAX_FAILURES) {
    rec.lockedUntil = now + LOGIN_LOCK_MS;
  }
  failures.set(key, rec);
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
