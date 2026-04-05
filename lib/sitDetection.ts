/**
 * Fuzzy SIT completion comment detector.
 * Tolerates typos, grammar variants, and missing words.
 *
 * Target phrase family: "SIT for this user story is completed"
 */

/** Extract plain text from Jira ADF (Atlassian Document Format) body */
export function extractAdfText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (n.type === 'text' && typeof n.text === 'string') return n.text;
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(extractAdfText).join(' ');
  }
  return '';
}

/** Score-based fuzzy match — returns true if the comment looks like a SIT sign-off */
export function isSitCompleteComment(text: string): boolean {
  const t = text.toLowerCase();

  // Must mention SIT explicitly
  const hasSit = /\bsit\b/.test(t);
  if (!hasSit) return false;

  // Must have a completion signal word (covers typos like "compelted", "complteed")
  const hasComplete =
    /complet|done\b|finish|passed\b|sign.?off|cleared|signed.?off/.test(t);

  return hasComplete;
}
