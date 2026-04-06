import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, badRequest } from '@/lib/apiError';
import { resolveJiraCredentials } from '@/lib/jira';
import { extractAdfText, isSitCompleteComment } from '@/lib/sitDetection';
import { decryptField } from '@/lib/encrypt';

/**
 * Debug endpoint: GET /api/admin/debug-sit?key=EO-3267&productId=xxx
 * Returns raw comment data + detection results for a specific Jira issue.
 * Admin-only. Remove once issue is diagnosed.
 */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const { searchParams } = new URL(req.url);
  const issueKey = searchParams.get('key')?.trim();
  const productId = searchParams.get('productId')?.trim();

  if (!issueKey) return badRequest('key is required', 'KEY_REQUIRED');

  // Resolve credentials — prefer per-product if productId given
  let creds: ReturnType<typeof resolveJiraCredentials> = null;
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { jiraBaseUrl: true, jiraEmail: true, jiraToken: true }
    });
    if (product) {
      const perProduct = product.jiraBaseUrl || product.jiraEmail || product.jiraToken
        ? {
            baseUrl: product.jiraBaseUrl ?? undefined,
            email: product.jiraEmail ?? undefined,
            token: decryptField(product.jiraToken) ?? undefined
          }
        : null;
      creds = resolveJiraCredentials(perProduct);
    }
  }
  if (!creds) creds = resolveJiraCredentials(null); // fall back to env vars

  if (!creds) {
    return NextResponse.json({ error: 'No Jira credentials configured' });
  }

  const authHeader = `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString('base64')}`;
  const url = `${creds.baseUrl}/rest/api/3/issue/${issueKey}/comment?maxResults=100`;

  let httpStatus: number | null = null;
  let rawPayload: unknown = null;
  let fetchError: string | null = null;

  try {
    const res = await fetch(url, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
      cache: 'no-store'
    });
    httpStatus = res.status;
    if (res.ok) {
      rawPayload = await res.json();
    } else {
      rawPayload = await res.text().catch(() => '(unreadable)');
    }
  } catch (err) {
    fetchError = err instanceof Error ? err.message : String(err);
  }

  // If we got comments, analyse each
  type RawComment = { id: string; body: unknown; author?: { displayName?: string }; created: string };
  const comments = Array.isArray((rawPayload as { comments?: RawComment[] })?.comments)
    ? (rawPayload as { comments: RawComment[] }).comments
    : [];

  const analysis = comments.map((c) => {
    const text = extractAdfText(c.body);
    const matched = isSitCompleteComment(text);
    return {
      id: c.id,
      author: c.author?.displayName ?? 'Unknown',
      created: c.created,
      bodyType: typeof c.body === 'string' ? 'string' : c.body === null ? 'null' : (c.body as Record<string, unknown>)?.type ?? 'object',
      extractedText: text.slice(0, 500),
      sitDetected: matched
    };
  });

  return NextResponse.json({
    issueKey,
    credBaseUrl: creds.baseUrl,
    credEmail: creds.email,
    url,
    httpStatus,
    fetchError,
    commentCount: comments.length,
    analysis
  });
}
