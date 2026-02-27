import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getAuthSession } from '../../../../../lib/auth';
import { createActivity } from '../../../../../lib/activity';
import { ActivityType, TaskHistoryAction } from '@prisma/client';
import { validateExpectedUpdatedAt } from '../../../../../lib/taskGuards';
import { createTaskHistory } from '../../../../../lib/taskHistory';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../../../../lib/apiError';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return badRequest('Missing id', 'TASK_ID_MISSING');
  }

  const session = await getAuthSession();

  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  const body = await req.json().catch(() => null);
  const text = body?.body as string | undefined;
  const stepOrder = typeof body?.stepOrder === 'number' ? body.stepOrder : undefined;
  const mentionUserIdsRaw: unknown[] = Array.isArray(body?.mentionUserIds) ? body.mentionUserIds : [];
  const expectedUpdatedAt = body?.expectedUpdatedAt;

  if (!text || !text.trim()) {
    return badRequest('Invalid comment', 'COMMENT_INVALID');
  }

  const task = await prisma.task.findUnique({
    where: { id }
  });

  if (!task) {
    return notFound('Not found', 'TASK_NOT_FOUND');
  }

  if (task.signedOffAt) {
    return conflict('Task is signed off and locked', 'TASK_LOCKED');
  }

  const staleMessage = validateExpectedUpdatedAt(task.updatedAt, expectedUpdatedAt);
  if (staleMessage) {
    return conflict(staleMessage, 'TASK_STALE');
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return forbidden('Forbidden', 'TASK_FORBIDDEN');
    }
    if (task.status === 'DRAFT') {
      return conflict('Task is not ready for stakeholder actions', 'TASK_NOT_READY');
    }
  }

  const created = await prisma.comment.create({
    data: {
      taskId: id,
      authorId: session.user.id,
      body: text.trim(),
      stepOrder: stepOrder && stepOrder > 0 ? stepOrder : null
    }
  });

  const mentionCandidateIds: string[] = Array.from(
    new Set<string>(
      mentionUserIdsRaw
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  ).filter((userId) => userId !== session.user.id);

  const mentionUserIds =
    mentionCandidateIds.length === 0
      ? []
      : (
          await prisma.user.findMany({
            where: {
              id: { in: mentionCandidateIds },
              isActive: true
            },
            select: { id: true }
          })
        ).map((user) => user.id);

  await prisma.task.update({
    where: { id },
    data: {
      updatedById: session.user.id
    }
  });

  try {
    await prisma.commentRead.create({
      data: {
        commentId: created.id,
        userId: session.user.id
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('commentRead create failed:', error);
    }
  }

  try {
    await createActivity({
      type: ActivityType.COMMENT_ADDED,
      message:
        stepOrder && stepOrder > 0
          ? `${session.user.name || session.user.email} added a comment on Step ${stepOrder} in ${task.title}${mentionUserIds.length > 0 ? ` and tagged ${mentionUserIds.length} user(s)` : ''}.`
          : `${session.user.name || session.user.email} added a comment on ${task.title}${mentionUserIds.length > 0 ? ` and tagged ${mentionUserIds.length} user(s)` : ''}.`,
      taskId: id,
      actorId: session.user.id,
      countryCode: task.countryCode
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('activity create failed:', error);
    }
  }

  await createTaskHistory({
    taskId: id,
    actorId: session.user.id,
    action: TaskHistoryAction.COMMENT_ADDED,
    message:
      stepOrder && stepOrder > 0
        ? `${session.user.name || session.user.email || 'User'} added a comment on Step ${stepOrder}.`
        : `${session.user.name || session.user.email || 'User'} added a comment.`,
    after: {
      commentId: created.id,
      stepOrder: stepOrder && stepOrder > 0 ? stepOrder : null,
      body: text.trim(),
      mentionUserIds
    },
    metadata: mentionUserIds.length > 0 ? { mentionUserIds } : undefined
  });

  return NextResponse.json({ ok: true, id: created.id, mentionUserIds });
}
