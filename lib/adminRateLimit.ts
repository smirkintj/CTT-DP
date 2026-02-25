const lastActionAt = new Map<string, number>();

export function canRunAdminAction(key: string, cooldownMs: number) {
  const now = Date.now();
  const previous = lastActionAt.get(key) ?? 0;
  if (now - previous < cooldownMs) {
    return false;
  }
  lastActionAt.set(key, now);
  return true;
}
