// app/api/sit-tasks/[id]/test-cases/[tcId]/defects/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';
import { fetchJiraIssueLinks } from '@/lib/jira';
import { decryptField } from '@/lib/encrypt';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; tcId: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();

  const task = await prisma.sitTask.findUnique({
    where: { id },
    select: {
      jiraTicket: true,
      product: { select: { jiraBaseUrl: true, jiraEmail: true, jiraToken: true } },
    },
  });
  if (!task) return notFound();

  const perProduct = task.product.jiraBaseUrl
    ? {
        baseUrl: task.product.jiraBaseUrl ?? undefined,
        email: task.product.jiraEmail ?? undefined,
        token: decryptField(task.product.jiraToken) ?? undefined,
      }
    : null;

  const links = await fetchJiraIssueLinks(task.jiraTicket, perProduct);
  return NextResponse.json(links);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; tcId: string }> }
) {
  const { id, tcId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const tc = await prisma.sitTestCase.findUnique({
    where: { id: tcId },
    select: { id: true, seqId: true, sitTaskId: true },
  });
  if (!tc || tc.sitTaskId !== id) return notFound();

  const body = await req.json().catch(() => ({}));
  const { jiraKey, summary, status: defectStatus, priority, url } = body;
  if (!jiraKey) return badRequest('jiraKey required');

  const defect = await prisma.sitDefect.create({
    data: {
      sitTestCaseId: tcId,
      jiraKey,
      summary: summary ?? null,
      status: defectStatus ?? null,
      priority: priority ?? null,
      url: url ?? null,
    },
  });

  await createSitHistory({
    sitTaskId: id,
    actorId: session.user.id,
    action: SitHistoryAction.DEFECT_LINKED,
    message: `${session.user.name ?? session.user.email} linked defect ${jiraKey} to TC#${tc.seqId}.`,
  });

  return NextResponse.json(defect, { status: 201 });
}
