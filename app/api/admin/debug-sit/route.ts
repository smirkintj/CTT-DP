import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, badRequest } from '@/lib/apiError';
import { resolveJiraCredentials } from '@/lib/jira';
import { extractAdfText, isSitCompleteComment } from '@/lib/sitDetection';
import { decryptField } from '@/lib/encrypt';

/**
 * Debug endpoint: GET /api/admin/debug-sit?key=EO-3267
 * Simulates exactly what the jira-intake route does for one issue key.
 * Admin-only. Remove once issue is diagnosed.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const { searchParams } = new URL(req.url);
  const issueKey = searchParams.get('key')?.trim();
  if (!issueKey) return badRequest('key is required', 'KEY_REQUIRED');

  // --- Step 1: Find which product owns this Jira key prefix ---
  const prefix = issueKey.split('-')[0]; // e.g. "EO"
  const products = await prisma.product.findMany({
    where: { isActive: true, jiraProjectKey: prefix },
    select: { id: true, name: true, jiraBaseUrl: true, jiraEmail: true, jiraToken: true }
  });

  // --- Step 2: Resolve credentials (same logic as jira-intake route) ---
  let credSource = 'env';
  let creds: ReturnType<typeof resolveJiraCredentials> = null;
  let perProductEmail: string | undefined;

  if (products.length > 0) {
    const product = products[0];
    const perProduct = product.jiraBaseUrl || product.jiraEmail || product.jiraToken
      ? {
          baseUrl: product.jiraBaseUrl ?? undefined,
          email: product.jiraEmail ?? undefined,
          token: decryptField(product.jiraToken) ?? undefined
        }
      : null;
    creds = resolveJiraCredentials(perProduct);
    perProductEmail = perProduct?.email;
    credSource = creds ? `product:${product.name}` : 'env-fallback';
  }
  if (!creds) creds = resolveJiraCredentials(null);
  if (!creds) return NextResponse.json({ error: 'No Jira credentials configured' });

  // --- Step 3: Check DB for linked CTT tasks (same as route) ---
  const linkedTasks = await prisma.task.findMany({
    where: { jiraTicket: issueKey },
    select: { id: true, title: true, status: true, countryCode: true, sitSignedOffAt: true }
  }).catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }));

  const tasksIsError = !Array.isArray(linkedTasks);
  const taskList = Array.isArray(linkedTasks) ? linkedTasks : [];
  const allTasksAcknowledged = taskList.length > 0 && taskList.every(t => t.sitSignedOffAt !== null);
  const wouldSkip = taskList.length > 0 && allTasksAcknowledged;

  // --- Step 4: Fetch comments (same as route, with per-product creds) ---
  const authHeader = `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString('base64')}`;
  const url = `${creds.baseUrl}/rest/api/3/issue/${issueKey}/comment?maxResults=100`;

  let httpStatus: number | null = null;
  let fetchError: string | null = null;
  type RawComment = { id: string; body: unknown; author?: { displayName?: string }; created: string };
  let comments: RawComment[] = [];

  if (!wouldSkip) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
        cache: 'no-store'
      });
      httpStatus = res.status;
      if (res.ok) {
        const payload = await res.json() as { comments?: RawComment[] };
        comments = payload.comments ?? [];
      } else {
        fetchError = `HTTP ${res.status}: ${await res.text().catch(() => '(unreadable)')}`;
      }
    } catch (err) {
      fetchError = err instanceof Error ? err.message : String(err);
    }
  }

  // --- Step 5: Run detection (same as route) ---
  const sorted = [...comments].sort(
    (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
  );

  let sitFound: { comment: string; author: string; date: string } | null = null;
  const analysis = sorted.map((c) => {
    const text = extractAdfText(c.body);
    const matched = isSitCompleteComment(text);
    if (matched && !sitFound) {
      sitFound = { comment: text.trim().slice(0, 300), author: c.author?.displayName ?? 'Unknown', date: c.created };
    }
    return {
      id: c.id,
      author: c.author?.displayName ?? 'Unknown',
      created: c.created,
      bodyType: typeof c.body === 'string' ? 'string' : c.body === null ? 'null' : (c.body as Record<string, unknown>)?.type ?? 'object',
      extractedText: text.slice(0, 300),
      sitDetected: matched
    };
  });

  return NextResponse.json({
    issueKey,
    credSource,
    credEmail: creds.email,
    perProductEmail: perProductEmail ?? null,
    // DB state
    linkedTaskCount: taskList.length,
    linkedTasks: tasksIsError ? { error: (linkedTasks as { error: string }).error } : taskList.map(t => ({
      id: t.id, title: t.title, status: t.status, countryCode: t.countryCode,
      sitSignedOffAt: t.sitSignedOffAt ? (t.sitSignedOffAt as Date).toISOString() : null
    })),
    // Route simulation
    wouldSkipDueToAllAcknowledged: wouldSkip,
    // Comment fetch
    commentFetchUrl: wouldSkip ? '(skipped)' : url,
    httpStatus,
    fetchError,
    commentCount: comments.length,
    analysis,
    // Final result
    sitComplete: !!sitFound,
    sitFound
  });
}
