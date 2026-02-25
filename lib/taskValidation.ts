const JIRA_TICKET_REGEX = /^(EO-\d+|\d+)$/i;

export function isValidJiraTicket(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;
  return JIRA_TICKET_REGEX.test(trimmed);
}

export function isValidDueDate(value: unknown): boolean {
  if (value === null || typeof value === 'undefined' || value === '') return true;
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}
