import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getAuthSession } from '../../../../../lib/auth';
import { mapUiStatusToDb } from '../../_mappers';
import { ActivityType, TaskHistoryAction } from '@prisma/client';
import { createActivity, toStatusLabel } from '../../../../../lib/activity';
import { sendTeamsMessage } from '../../../../../lib/teams';
import { validateExpectedUpdatedAt, validateTaskTransition } from '../../../../../lib/taskGuards';
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
  const status = body?.status as string | undefined;
  const stepOrder = typeof body?.stepOrder === 'number' ? body.stepOrder : undefined;
  const expectedUpdatedAt = body?.expectedUpdatedAt;

  if (!status) {
    return badRequest('Invalid status', 'TASK_STATUS_INVALID');
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
  }

  const dbStatus = mapUiStatusToDb(status);
  const previousStatus = task.status;

  if (previousStatus === dbStatus) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const transitionError = validateTaskTransition(previousStatus, dbStatus);
  if (transitionError) {
    return conflict(transitionError, 'TASK_STATUS_TRANSITION_INVALID');
  }

  await prisma.task.update({
    where: { id },
    data: {
      status: dbStatus,
      updatedById: session.user.id
    }
  });

  if (dbStatus === 'DEPLOYED' || dbStatus === 'FAILED') {
    const failedMessage =
      stepOrder && stepOrder > 0
        ? `${session.user.name || session.user.email} marked Step ${stepOrder} in ${task.title} as Failed.`
        : `${session.user.name || session.user.email} marked a step in ${task.title} as Failed.`;

    await createActivity({
      type: dbStatus === 'DEPLOYED' ? ActivityType.DEPLOYED : ActivityType.STATUS_CHANGED,
      message:
        dbStatus === 'FAILED'
          ? failedMessage
          : `${session.user.name || session.user.email} changed "${task.title}" from ${toStatusLabel(previousStatus)} to ${toStatusLabel(dbStatus)}.`,
      taskId: id,
      actorId: session.user.id,
      countryCode: task.countryCode
    });

    if (dbStatus === 'FAILED') {
      void sendTeamsMessage({
        countryCode: task.countryCode,
        eventType: 'FAILED_STEP',
        title: `UAT Step Failed (${task.countryCode})`,
        text: failedMessage,
        taskId: task.id,
        facts: [
          { name: 'Task', value: task.title },
          { name: 'Status', value: toStatusLabel(dbStatus) },
          { name: 'Actor', value: session.user.name || session.user.email || 'User' }
        ]
      });
    }
  }

  await createTaskHistory({
    taskId: id,
    actorId: session.user.id,
    action: dbStatus === 'DEPLOYED' ? TaskHistoryAction.DEPLOYED : TaskHistoryAction.STATUS_CHANGED,
    message: `${session.user.name || session.user.email || 'User'} changed status from ${toStatusLabel(previousStatus)} to ${toStatusLabel(dbStatus)}.`,
    before: { status: previousStatus },
    after: { status: dbStatus },
    metadata: stepOrder ? { stepOrder } : undefined
  });

  return NextResponse.json({ ok: true });
}
