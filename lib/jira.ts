type JiraIssueResponse = {
  key: string;
  fields?: {
    summary?: string | null;
    updated?: string | null;
    status?: { name?: string | null } | null;
    priority?: { name?: string | null } | null;
    assignee?: { displayName?: string | null; emailAddress?: string | null } | null;
  };
};

export function isJiraConfigured() {
  return Boolean(process.env.JIRA_BASE_URL && process.env.JIRA_API_EMAIL && process.env.JIRA_API_TOKEN);
}

function getAuthHeader() {
  const email = process.env.JIRA_API_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) return null;
  return `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
}

export async function transitionJiraIssue(issueKey: string, targetStatusName: string): Promise<void> {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
  const authHeader = getAuthHeader();
  if (!baseUrl || !authHeader) return;

  try {
    const res = await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    });
    if (!res.ok) return;

    const payload = (await res.json()) as { transitions?: { id: string; name: string }[] };
    const transitions = Array.isArray(payload.transitions) ? payload.transitions : [];
    const match = transitions.find(t => t.name.toLowerCase() === targetStatusName.toLowerCase());
    if (!match) return;

    await fetch(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition: { id: match.id } })
    });
  } catch {
    // Silently swallow — Jira unavailability must never break task saves
  }
}

export async function searchJiraIssues(input: {
  projectKey: string;
  statuses: string[];
  maxResults?: number;
}): Promise<Array<{
  key: string;
  summary: string;
  status: string;
  updatedAt: string;
  priority?: string | null;
  assigneeName?: string | null;
}>> {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/$/, '');
  const authHeader = getAuthHeader();
  if (!baseUrl || !authHeader) {
    throw new Error('JIRA_NOT_CONFIGURED');
  }

  const statuses = input.statuses.filter(Boolean);
  if (statuses.length === 0) return [];

  const statusClause = statuses.map((status) => `"${status.replace(/"/g, '\\"')}"`).join(', ');
  const jql = `project = "${input.projectKey}" AND status in (${statusClause}) ORDER BY updated DESC`;
  const response = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jql,
      maxResults: input.maxResults ?? 30,
      fields: ['summary', 'status', 'updated', 'priority', 'assignee']
    }),
    next: { revalidate: 60 }
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(`JIRA_FETCH_FAILED:${response.status}:${raw}`);
  }

  const payload = (await response.json()) as { issues?: JiraIssueResponse[] };
  const issues = Array.isArray(payload.issues) ? payload.issues : [];

  return issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields?.summary || issue.key,
    status: issue.fields?.status?.name || 'Unknown',
    updatedAt: issue.fields?.updated || '',
    priority: issue.fields?.priority?.name || null,
    assigneeName: issue.fields?.assignee?.displayName || issue.fields?.assignee?.emailAddress || null
  }));
}
