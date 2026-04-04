import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { forbidden, unauthorized } from '@/lib/apiError';
import { isJiraConfigured, searchJiraIssues, resolveJiraCredentials } from '@/lib/jira';
import { decryptField } from '@/lib/encrypt';

const statusMap: Record<string, string> = {
  DRAFT: 'Draft',
  READY: 'Ready',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
  BLOCKED: 'Blocked',
  DEPLOYED: 'Deployed'
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  // For JIRA Queue, only show the admin's explicitly assigned products.
  // If they have no product assignments, show nothing.
  const productAccesses = await prisma.userProductAccess.findMany({
    where: { userId: session.user.id },
    select: { productId: true }
  });
  const assignedProductIds = productAccesses.map((a) => a.productId);

  // If admin has no assigned products, return empty
  if (assignedProductIds.length === 0) {
    return NextResponse.json({ configured: false, groups: [] });
  }

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      id: { in: assignedProductIds }
    },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      slug: true,
      jiraProjectKey: true,
      jiraPullStatuses: true,
      jiraBaseUrl: true,
      jiraEmail: true,
      jiraToken: true
    }
  });

  const groups = await Promise.all(
    products.map(async (product) => {
      const perProduct = product.jiraBaseUrl || product.jiraEmail || product.jiraToken
        ? {
            baseUrl: product.jiraBaseUrl ?? undefined,
            email: product.jiraEmail ?? undefined,
            token: decryptField(product.jiraToken) ?? undefined
          }
        : null;

      const creds = resolveJiraCredentials(perProduct);

      if (!creds || !product.jiraProjectKey || product.jiraPullStatuses.length === 0) {
        return {
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          projectKey: product.jiraProjectKey || '',
          statuses: product.jiraPullStatuses,
          issues: [],
          ...(!creds ? { error: 'Jira credentials not configured for this product' } : {})
        };
      }

      let issues: Awaited<ReturnType<typeof searchJiraIssues>>;
      try {
        issues = await searchJiraIssues({
          projectKey: product.jiraProjectKey,
          statuses: product.jiraPullStatuses,
          maxResults: 30
        }, perProduct);
      } catch (error) {
        return {
          productId: product.id,
          productName: product.name,
          productSlug: product.slug,
          projectKey: product.jiraProjectKey,
          statuses: product.jiraPullStatuses,
          issues: [],
          error: error instanceof Error ? error.message : 'Failed to load Jira issues'
        };
      }

      const jiraKeys = issues.map((issue) => issue.key);
      const linkedTasks = jiraKeys.length
        ? await prisma.task.findMany({
            where: {
              jiraTicket: { in: jiraKeys }
            },
            select: {
              id: true,
              title: true,
              jiraTicket: true,
              status: true,
              countryCode: true,
              product: { select: { name: true } }
            },
            orderBy: [{ updatedAt: 'desc' }]
          })
        : [];

      const linkedTaskMap = new Map<string, Array<{
        id: string;
        title: string;
        status: string;
        countryCode: string;
        productName: string;
      }>>();

      for (const task of linkedTasks) {
        const key = task.jiraTicket || '';
        if (!key) continue;
        if (!linkedTaskMap.has(key)) linkedTaskMap.set(key, []);
        linkedTaskMap.get(key)!.push({
          id: task.id,
          title: task.title,
          status: statusMap[task.status] || task.status,
          countryCode: task.countryCode,
          productName: task.product.name
        });
      }

      return {
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        projectKey: product.jiraProjectKey,
        statuses: product.jiraPullStatuses,
        issues: issues.map((issue) => ({
          ...issue,
          productId: product.id,
          productName: product.name,
          projectKey: product.jiraProjectKey!,
          linkedTasks: linkedTaskMap.get(issue.key) || []
        }))
      };
    })
  );

  const anyConfigured = groups.some(g => !('error' in g) || (g as { error?: string }).error !== 'Jira credentials not configured for this product');
  return NextResponse.json({
    configured: anyConfigured,
    groups
  });
}
