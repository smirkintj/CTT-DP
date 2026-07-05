// app/api/sit-tasks/[id]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction, SitTaskStatus } from '@prisma/client';
import { transitionJiraIssue, isJiraConfigured } from '@/lib/jira';
import { decryptField } from '@/lib/encrypt';

const fullInclude = {
  product: {
    select: {
      name: true,
      jiraBaseUrl: true,
      jiraEmail: true,
      jiraToken: true,
      jiraReadyForTestingTransition: true,
      jiraTestingTransition: true,
    },
  },
  assignee: { select: { name: true, email: true } },
  countries: { select: { countryCode: true } },
  testCases: {
    orderBy: { seqId: 'asc' as const },
    include: {
      evidence: true,
      defects: true,
      countryResults: { orderBy: { countryCode: 'asc' as const } },
    },
  },
};

async function getTaskOrFail(id: string, userId: string, role: string) {
  const task = await prisma.sitTask.findUnique({ where: { id }, include: fullInclude });
  if (!task) return null;
  if (role === 'QA') {
    const access = await prisma.userProductAccess.findFirst({
      where: { userId, productId: task.productId },
    });
    if (!access) return null;
  }
  return task;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA' && session.user.role !== 'ADMIN') return forbidden();

  const task = await getTaskOrFail(id, session.user.id, session.user.role);
  if (!task) return notFound();

  return NextResponse.json(task);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const task = await getTaskOrFail(id, session.user.id, session.user.role);
  if (!task) return notFound();

  const body = await req.json().catch(() => ({}));
  const { status, sprintName, environment, module: mod, countryCodes } = body;

  if (status !== undefined && !Object.values(SitTaskStatus).includes(status as SitTaskStatus)) {
    return NextResponse.json({ error: 'Invalid status value', code: 'INVALID_STATUS' }, { status: 400 });
  }

  const updateData: Record<string, unknown> = { updatedById: session.user.id };
  if (sprintName) updateData.sprintName = sprintName;
  if (environment !== undefined) updateData.environment = environment;
  if (mod !== undefined) updateData.module = mod;
  if (status && status !== task.status) updateData.status = status;

  const updated = await prisma.sitTask.update({
    where: { id },
    data: updateData,
    include: fullInclude,
  });

  // Update countries if provided
  if (Array.isArray(countryCodes)) {
    await prisma.sitTaskCountry.deleteMany({ where: { sitTaskId: id } });
    await prisma.sitTaskCountry.createMany({
      data: countryCodes.map((c: string) => ({ sitTaskId: id, countryCode: c })),
    });
  }

  // Jira transitions on status change
  if (status && status !== task.status) {
    const perProduct =
      task.product.jiraBaseUrl
        ? {
            baseUrl: task.product.jiraBaseUrl ?? undefined,
            email: task.product.jiraEmail ?? undefined,
            token: decryptField(task.product.jiraToken) ?? undefined,
          }
        : null;

    if (isJiraConfigured(perProduct) && task.jiraTicket) {
      if (status === SitTaskStatus.READY) {
        void transitionJiraIssue(
          task.jiraTicket,
          task.product.jiraReadyForTestingTransition || 'Ready for Testing',
          perProduct
        );
      } else if (status === SitTaskStatus.IN_PROGRESS) {
        void transitionJiraIssue(
          task.jiraTicket,
          task.product.jiraTestingTransition || 'Testing',
          perProduct
        );
      }
    }

    await createSitHistory({
      sitTaskId: id,
      actorId: session.user.id,
      action:
        status === SitTaskStatus.READY
          ? SitHistoryAction.TASK_PUBLISHED
          : SitHistoryAction.STATUS_CHANGED,
      message: `${session.user.name ?? session.user.email} changed status to ${status}.`,
      before: { status: task.status },
      after: { status },
    });
  }

  return NextResponse.json(updated);
}
