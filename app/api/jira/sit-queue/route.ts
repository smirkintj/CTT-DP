// app/api/jira/sit-queue/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden } from '@/lib/apiError';
import { searchJiraIssues, isJiraConfigured } from '@/lib/jira';
import { decryptField } from '@/lib/encrypt';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const productAccesses = await prisma.userProductAccess.findMany({
    where: { userId: session.user.id },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          jiraBaseUrl: true,
          jiraEmail: true,
          jiraToken: true,
          jiraProjectKey: true,
          jiraReadyForTestingTransition: true,
        },
      },
    },
  });

  const results = [];
  for (const access of productAccesses) {
    const p = access.product;
    const perProduct = p.jiraBaseUrl
      ? {
          baseUrl: p.jiraBaseUrl ?? undefined,
          email: p.jiraEmail ?? undefined,
          token: decryptField(p.jiraToken) ?? undefined,
        }
      : null;

    if (!isJiraConfigured(perProduct)) continue;

    const readyStatus = p.jiraReadyForTestingTransition || 'Ready for Testing';
    const projectKey = p.jiraProjectKey ?? p.name;

    const issues = await searchJiraIssues(
      { projectKey, statuses: [readyStatus] },
      perProduct
    ).catch(() => []);

    // Filter out tickets already linked to a SIT task for this product
    const existingTickets = await prisma.sitTask.findMany({
      where: {
        productId: p.id,
        jiraTicket: { in: issues.map((i) => i.key) },
      },
      select: { jiraTicket: true },
    });
    const existingSet = new Set(existingTickets.map((t) => t.jiraTicket));

    for (const issue of issues) {
      if (existingSet.has(issue.key)) continue;
      results.push({
        key: issue.key,
        summary: issue.summary,
        productId: p.id,
        productName: p.name,
        status: readyStatus,
      });
    }
  }

  return NextResponse.json(results);
}
