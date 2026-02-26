const JIRA_TICKET_REGEX = /^(EO-\d+|\d+)$/i;

export function isValidJiraTicket(value: unknown): boolean {
  if (value === null || typeof value === 'undefined') return true;
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;

  // Accept full Jira URL and validate by its ticket key segment.
  const fromBrowseUrl = trimmed.match(/\/browse\/([^/?#]+)/i)?.[1];
  const candidate = (fromBrowseUrl || trimmed).toUpperCase();

  return JIRA_TICKET_REGEX.test(candidate);
}

export function isValidDueDate(value: unknown): boolean {
  if (value === null || typeof value === 'undefined' || value === '') return true;
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}
