export interface MentionUser {
  id: string;
  name?: string | null;
  email?: string | null;
}

const normalizeText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const compactToken = (value: string) =>
  normalizeText(value).replace(/[\s._-]+/g, '');

export const extractMentionTokens = (text: string): string[] => {
  const tokens = new Set<string>();

  const braced = text.matchAll(/@\{([^}]+)\}/g);
  for (const match of braced) {
    const raw = (match[1] || '').trim();
    if (raw) tokens.add(raw);
  }

  const plain = text.matchAll(/(^|\s)@([^\s@{}]+)/g);
  for (const match of plain) {
    const raw = (match[2] || '').trim();
    if (raw) tokens.add(raw);
  }

  return Array.from(tokens);
};

export const resolveMentionUserIds = (text: string, users: MentionUser[]): string[] => {
  const tokens = extractMentionTokens(text);
  if (tokens.length === 0) return [];

  const resolved = new Set<string>();
  for (const token of tokens) {
    const tokenNorm = normalizeText(token);
    const tokenCompact = compactToken(token);
    for (const user of users) {
      if (!user.id) continue;
      const emailNorm = normalizeText(user.email || '');
      const emailLocalNorm = emailNorm.split('@')[0] || '';
      const nameNorm = normalizeText(user.name || '');
      const nameCompact = compactToken(user.name || '');
      if (
        tokenNorm === emailNorm ||
        tokenNorm === emailLocalNorm ||
        tokenNorm === nameNorm ||
        tokenCompact === nameCompact
      ) {
        resolved.add(user.id);
      }
    }
  }

  return Array.from(resolved);
};

