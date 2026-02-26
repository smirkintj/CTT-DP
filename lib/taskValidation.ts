const JIRA_TICKET_REGEX = /^(EO-\d+|\d+)$/i;

function extractJiraCandidate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const fromBrowseUrl = trimmed.match(/\/browse\/([^/?#]+)/i)?.[1];
  return (fromBrowseUrl || trimmed).toUpperCase();
}

export function normalizeJiraTicketInput(value: unknown): string {
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value !== 'string') return '';
  const candidate = extractJiraCandidate(value);
  if (!candidate) return '';
  if (/^\d+$/.test(candidate)) return `EO-${candidate}`;
  return candidate;
}

export function isValidJiraTicket(value: unknown): boolean {
  if (value === null || typeof value === 'undefined') return true;
  if (typeof value !== 'string') return false;
  const candidate = extractJiraCandidate(value);
  if (!candidate) return true;

  return JIRA_TICKET_REGEX.test(candidate);
}

export function isValidDueDate(value: unknown): boolean {
  if (value === null || typeof value === 'undefined' || value === '') return true;
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}
