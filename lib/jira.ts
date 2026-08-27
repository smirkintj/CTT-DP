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
export type JiraIssueMatch = {
  key: string;
  summary: string;
  attachments: Array<{ id: string; filename: string; content: string; mimeType: string; size: number }>;
  /** Every attachment, so a non-spreadsheet file can be reported rather than look like none. */
  allAttachmentNames: string[];
};

export type JiraSearchOutcome = {
  issues: JiraIssueMatch[];
  /** The exact JQL used, so an admin can run it in Jira and compare. */
  jql: string;
  /** Set when the search itself failed — distinct from a genuine zero result. */
  error?: string;
};

/**
 * Find issues whose comments mention the keyword.
 *
 * `withinHours` of 0 means no recency bound — the daily cron only needs a
 * narrow window, but a manual scan should find anything not yet processed.
 */
export async function searchJiraIssuesWithKeywordComment(
  projectKey: string,
  keyword: string,
  withinHours: number,
  perProduct?: Partial<JiraCredentials> | null
): Promise<JiraSearchOutcome> {
  const recency = withinHours > 0 ? ` AND updated >= "-${withinHours}h"` : '';
  const jql = `project = "${projectKey}" AND comment ~ "${keyword.replace(/"/g, '\\"')}"${recency} ORDER BY updated DESC`;

  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return { issues: [], jql, error: 'No Jira credentials configured for this product' };
  const authHeader = makeAuthHeader(creds);

  try {
    const res = await fetch(`${creds.baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql, fields: ['summary', 'attachment'], maxResults: 20 }),
      cache: 'no-store'
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[jira] searchJiraIssuesWithKeywordComment → HTTP ${res.status} ${detail.slice(0, 300)}`);
      // Previously this returned [], so an auth failure or bad JQL looked
      // exactly like "no issues matched".
      return { issues: [], jql, error: `Jira returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}` };
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

    const issues = (payload.issues ?? []).map((issue) => ({
      key: issue.key,
      summary: issue.fields?.summary ?? issue.key,
      attachments: (issue.fields?.attachment ?? []).filter((a) =>
        a.mimeType?.includes('spreadsheetml') || /\.(xlsx|xls)$/i.test(a.filename ?? '')
      ),
      allAttachmentNames: (issue.fields?.attachment ?? []).map((a) => a.filename ?? '')
    }));
    return { issues, jql };
  } catch (err) {
    console.error('[jira] searchJiraIssuesWithKeywordComment threw:', err);
    return { issues: [], jql, error: err instanceof Error ? err.message : 'Jira request failed' };
  }
}

export type JiraAttachmentResult = {
  buffer: Buffer | null;
  /** Populated on failure so the caller can report the real cause. */
  error?: string;
};

/**
 * Download a Jira attachment by its content URL.
 *
 * Jira answers the attachment endpoint with a 302 to a presigned S3 URL. The
 * redirect must be followed WITHOUT the Authorization header: the presigned
 * query string is already the credential, and S3 rejects a request that also
 * carries Basic auth. Letting fetch auto-follow forwards the header and fails
 * every download, which is indistinguishable from a bad attachment.
 */
export async function fetchJiraAttachmentDetailed(
  contentUrl: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<JiraAttachmentResult> {
  const creds = resolveJiraCredentials(perProduct);
  if (!creds) return { buffer: null, error: 'No Jira credentials configured' };

  try {
    let url = contentUrl;
    let res = await fetch(url, {
      headers: { Authorization: makeAuthHeader(creds), Accept: 'application/octet-stream' },
      redirect: 'manual',
      cache: 'no-store'
    });

    // Follow up to three hops, dropping auth once we leave the Jira host.
    for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop += 1) {
      const location = res.headers.get('location');
      if (!location) break;
      url = new URL(location, url).toString();
      const sameHost = new URL(url).host === new URL(contentUrl).host;
      res = await fetch(url, {
        headers: sameHost
          ? { Authorization: makeAuthHeader(creds), Accept: 'application/octet-stream' }
          : { Accept: 'application/octet-stream' },
        redirect: 'manual',
        cache: 'no-store'
      });
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`[jira] fetchJiraAttachment → HTTP ${res.status} ${detail.slice(0, 200)}`);
      return {
        buffer: null,
        error: `HTTP ${res.status}${detail ? `: ${detail.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`
      };
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return { buffer: null, error: 'downloaded 0 bytes' };
    }
    return { buffer: Buffer.from(arrayBuffer) };
  } catch (err) {
    console.error('[jira] fetchJiraAttachment threw:', err);
    return { buffer: null, error: err instanceof Error ? err.message : 'download failed' };
  }
}

/** Back-compat wrapper for callers that only need the buffer. */
export async function fetchJiraAttachment(
  contentUrl: string,
  perProduct?: Partial<JiraCredentials> | null
): Promise<Buffer | null> {
  return (await fetchJiraAttachmentDetailed(contentUrl, perProduct)).buffer;
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
