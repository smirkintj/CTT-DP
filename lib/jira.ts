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

export type JiraCredentials = {
  baseUrl: string;
  email: string;
  token: string;
};

/** Resolves credentials: per-product overrides global env vars */
export function resolveJiraCredentials(perProduct?: Partial<JiraCredentials> | null): JiraCredentials | null {
  const baseUrl = (perProduct?.baseUrl || process.env.JIRA_BASE_URL || '').replace(/\/$/, '');
  const email = perProduct?.email || process.env.JIRA_API_EMAIL || '';
  const token = perProduct?.token || process.env.JIRA_API_TOKEN || '';
  if (!baseUrl || !email || !token) return null;
  return { baseUrl, email, token };
}

function makeAuthHeader(creds: JiraCredentials) {
  return `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString('base64')}`;
}

export function isJiraConfigured(perProduct?: Partial<JiraCredentials> | null) {
  return resolveJiraCredentials(perProduct) !== null;
}

export async function transitionJiraIssue(
  issueKey: string,
  targetStatusName: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<void> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return;
  const authHeader = makeAuthHeader(creds);

  try {
    const res = await fetch(`${creds.baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    });
    if (!res.ok) return;

    const payload = (await res.json()) as { transitions?: { id: string; name: string }[] };
    const transitions = Array.isArray(payload.transitions) ? payload.transitions : [];
    const match = transitions.find(t => t.name.toLowerCase() === targetStatusName.toLowerCase());
    if (!match) return;

    await fetch(`${creds.baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition: { id: match.id } })
    });
  } catch {
    // Silently swallow — Jira unavailability must never break task saves
  }
}

export async function fetchJiraIssueComments(
  issueKey: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<Array<{ id: string; body: unknown; authorName: string; created: string }>> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return [];
  try {
    const res = await fetch(
      `${creds.baseUrl}/rest/api/3/issue/${issueKey}/comment?maxResults=100`,
      {
        headers: { Authorization: makeAuthHeader(creds), Accept: 'application/json' },
        cache: 'no-store'
      }
    );
    if (!res.ok) {
      console.error(`[jira] fetchComments ${issueKey} → HTTP ${res.status}`);
      return [];
    }
    const payload = (await res.json()) as { comments?: Array<{ id: string; body: unknown; author?: { displayName?: string }; created: string }> };
    return (payload.comments ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.author?.displayName ?? 'Unknown',
      created: c.created
    }));
  } catch (err) {
    console.error(`[jira] fetchComments ${issueKey} threw:`, err);
    return [];
  }
}

export async function createJiraSubtask(
  parentKey: string,
  summary: string,
  adfDescription: unknown,
  perProduct?: Partial<JiraCredentials> | null
): Promise<string | null> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return null;
  try {
    const projectKey = parentKey.split('-')[0];
    const res = await fetch(`${creds.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(creds),
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          project: { key: projectKey },
          parent: { key: parentKey },
          issuetype: { name: 'Sub-task' },
          summary,
          description: adfDescription
        }
      })
    });
    if (!res.ok) {
      console.error(`[jira] createJiraSubtask ${parentKey} → HTTP ${res.status}`, await res.text().catch(() => ''));
      return null;
    }
    const payload = (await res.json()) as { key?: string };
    return payload.key ?? null;
  } catch (err) {
    console.error(`[jira] createJiraSubtask ${parentKey} threw:`, err);
    return null;
  }
}

export async function attachFileToJiraIssue(
  issueKey: string,
  filename: string,
  content: Buffer,
  mimeType: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<void> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return;
  try {
    const formData = new FormData();
    formData.append('file', new Blob([content], { type: mimeType }), filename);
    const res = await fetch(`${creds.baseUrl}/rest/api/2/issue/${issueKey}/attachments`, {
      method: 'POST',
      headers: {
        Authorization: makeAuthHeader(creds),
        'X-Atlassian-Token': 'no-check'
      },
      body: formData
    });
    if (!res.ok) {
      console.error(`[jira] attachFile ${issueKey} → HTTP ${res.status}`, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error(`[jira] attachFile ${issueKey} threw:`, err);
  }
}

export async function searchJiraIssues(
  input: {
    projectKey: string;
    statuses: string[];
    maxResults?: number;
  },
  perProduct?: Partial<JiraCredentials> | null
): Promise<Array<{
  key: string;
  summary: string;
  status: string;
  updatedAt: string;
  priority?: string | null;
  assigneeName?: string | null;
}>> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) throw new Error('JIRA_NOT_CONFIGURED');
  const authHeader = makeAuthHeader(creds);

  const statuses = input.statuses.filter(Boolean);
  if (statuses.length === 0) return [];

  const statusClause = statuses.map((status) => `"${status.replace(/"/g, '\\"')}"`).join(', ');
  const jql = `project = "${input.projectKey}" AND status in (${statusClause}) AND issuetype not in ("Bug", "Defect", "Sub-task", "Subtask") ORDER BY updated DESC`;
  const response = await fetch(`${creds.baseUrl}/rest/api/3/search/jql`, {
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

/**
 * Search Jira issues that have a comment matching a keyword within a time window.
 * Returns issue keys with their Excel attachment lists.
 */
export async function searchJiraIssuesWithKeywordComment(
  projectKey: string,
  keyword: string,
  withinHours: number,
  perProduct?: Partial<JiraCredentials> | null
): Promise<Array<{ key: string; summary: string; attachments: Array<{ id: string; filename: string; content: string; mimeType: string; size: number }> }>> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return [];
  const authHeader = makeAuthHeader(creds);

  try {
    const jql = `project = "${projectKey}" AND comment ~ "${keyword.replace(/"/g, '\\"')}" AND updated >= "-${withinHours}h" ORDER BY updated DESC`;
    const res = await fetch(`${creds.baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql, fields: ['summary', 'attachment'], maxResults: 20 }),
      cache: 'no-store'
    });
    if (!res.ok) {
      console.error(`[jira] searchJiraIssuesWithKeywordComment → HTTP ${res.status}`);
      return [];
    }
    const payload = (await res.json()) as {
      issues?: Array<{
        key: string;
        fields?: {
          summary?: string;
          attachment?: Array<{ id: string; filename: string; content: string; mimeType: string; size: number }>;
        };
      }>;
    };

    return (payload.issues ?? []).map((issue) => ({
      key: issue.key,
      summary: issue.fields?.summary ?? issue.key,
      attachments: (issue.fields?.attachment ?? []).filter((a) =>
        a.mimeType?.includes('spreadsheetml') || /\.(xlsx|xls)$/i.test(a.filename ?? '')
      )
    }));
  } catch (err) {
    console.error('[jira] searchJiraIssuesWithKeywordComment threw:', err);
    return [];
  }
}

/** Download a Jira attachment by its content URL. Returns a Buffer. */
export async function fetchJiraAttachment(
  contentUrl: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<Buffer | null> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return null;
  try {
    const res = await fetch(contentUrl, {
      headers: { Authorization: makeAuthHeader(creds), Accept: 'application/octet-stream' },
      cache: 'no-store'
    });
    if (!res.ok) {
      console.error(`[jira] fetchJiraAttachment → HTTP ${res.status}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error('[jira] fetchJiraAttachment threw:', err);
    return null;
  }
}

/** Fetch sprint name from a Jira issue's sprint field (Agile).
 *  Returns sprint name string or null if not found / not configured. */
export async function fetchJiraIssueSprint(
  issueKey: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<string | null> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return null;
  try {
    const res = await fetch(
      `${creds.baseUrl}/rest/agile/1.0/issue/${encodeURIComponent(issueKey)}?fields=sprint`,
      {
        headers: {
          Authorization: makeAuthHeader(creds),
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.fields?.sprint?.name as string) ?? null;
  } catch {
    return null;
  }
}

export interface JiraLinkedIssue {
  key: string;
  summary: string;
  status: string;
  priority: string | null;
  url: string;
  linkType: string;
}

/** Fetch all linked issues for a Jira issue (for defect selection). */
export async function fetchJiraIssueLinks(
  issueKey: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<JiraLinkedIssue[]> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return [];
  try {
    const res = await fetch(
      `${creds.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=issuelinks,summary`,
      {
        headers: {
          Authorization: makeAuthHeader(creds),
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const links: JiraLinkedIssue[] = [];
    for (const link of data?.fields?.issuelinks ?? []) {
      const linked = link.outwardIssue ?? link.inwardIssue;
      if (!linked) continue;
      links.push({
        key: linked.key,
        summary: linked.fields?.summary ?? '',
        status: linked.fields?.status?.name ?? '',
        priority: linked.fields?.priority?.name ?? null,
        url: `${creds.baseUrl}/browse/${linked.key}`,
        linkType: link.type?.name ?? '',
      });
    }
    return links;
  } catch {
    return [];
  }
}
