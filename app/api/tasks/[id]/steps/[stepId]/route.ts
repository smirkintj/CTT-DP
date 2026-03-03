import { NextResponse } from 'next/server';
import prisma from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import { validateExpectedUpdatedAt } from '../../../../../../lib/taskGuards';
import { createTaskHistory } from '../../../../../../lib/taskHistory';
import { StepResult, TaskHistoryAction } from '@prisma/client';
import { logPilotEvent } from '../../../../../../lib/telemetry';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await params;
  if (!id || !stepId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    logPilotEvent('step.update.denied', { reason: 'unauthorized', taskId: id, stepId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await prisma.task.findUnique({
    where: { id }
  });

  if (!task) {
    logPilotEvent('step.update.denied', { reason: 'task_not_found', taskId: id, stepId, actorId: session.user.id });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (task.signedOffAt) {
    return NextResponse.json({ error: 'Task is signed off and locked' }, { status: 409 });
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (task.status === 'DRAFT') {
      return NextResponse.json({ error: 'Task is not ready for stakeholder actions' }, { status: 409 });
    }
  }

  const stepRecord = await prisma.taskStep.findUnique({
    where: { id: stepId }
  });

  if (!stepRecord || stepRecord.taskId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const requestedStepResult =
    body?.stepResult && Object.values(StepResult).includes(body.stepResult as StepResult)
      ? (body.stepResult as StepResult)
      : undefined;
  const conditionalReason =
    typeof body?.conditionalReason === 'string' ? body.conditionalReason.trim() : undefined;
  if (!isAdmin && requestedStepResult === StepResult.CONDITIONAL && !conditionalReason) {
    return NextResponse.json({ error: 'Conditional pass reason is required' }, { status: 400 });
  }
  const staleMessage = validateExpectedUpdatedAt(task.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return NextResponse.json({ error: staleMessage }, { status: 409 });
  }

  const data = isAdmin
    ? {
        description: body?.description ?? undefined,
        expectedResult: body?.expectedResult ?? undefined,
        testData: body?.testData ?? undefined
      }
    : {
        isPassed:
          requestedStepResult === StepResult.PASSED
            ? true
            : requestedStepResult === StepResult.FAILED
              ? false
              : requestedStepResult === StepResult.CONDITIONAL
                ? null
                : body?.isPassed ?? undefined,
        stepResult: requestedStepResult ?? (body?.isPassed === true ? StepResult.PASSED : body?.isPassed === false ? StepResult.FAILED : undefined),
        conditionalReason:
          requestedStepResult === StepResult.CONDITIONAL
            ? conditionalReason
            : requestedStepResult
              ? null
              : undefined,
        actualResult: body?.actualResult ?? undefined,
        attachments: body?.attachments ?? undefined
      };

  const step = await prisma.taskStep.update({
    where: { id: stepId },
    data
  });

  await prisma.task.update({
    where: { id },
    data: {
      updatedById: session.user.id
    }
  });

  await createTaskHistory({
    taskId: id,
    actorId: session.user.id,
    action: TaskHistoryAction.STEP_UPDATED,
    message: `${session.user.name || session.user.email || 'User'} updated Step ${stepRecord.order}.`,
    before: {
      description: stepRecord.description,
      expectedResult: stepRecord.expectedResult,
      testData: stepRecord.testData,
      actualResult: stepRecord.actualResult,
      isPassed: stepRecord.isPassed,
      stepResult: stepRecord.stepResult,
      conditionalReason: stepRecord.conditionalReason
    },
    after: {
      description: step.description,
      expectedResult: step.expectedResult,
      testData: step.testData,
      actualResult: step.actualResult,
      isPassed: step.isPassed,
      stepResult: step.stepResult,
      conditionalReason: step.conditionalReason
    }
  });

  logPilotEvent('step.update.success', {
    taskId: id,
    stepId,
    actorId: session.user.id,
    stepResult: step.stepResult ?? null
  });

  return NextResponse.json(step);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await params;
  if (!id || !stepId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stepRecord = await prisma.taskStep.findUnique({
    where: { id: stepId }
  });

  if (!stepRecord || stepRecord.taskId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: { signedOffAt: true, updatedAt: true }
  });
  if (task?.signedOffAt) {
    return NextResponse.json({ error: 'Task is signed off and locked' }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const staleMessage = validateExpectedUpdatedAt(task.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return NextResponse.json({ error: staleMessage }, { status: 409 });
  }

  await prisma.taskStep.delete({
    where: { id: stepId }
  });

  await createTaskHistory({
    taskId: id,
    actorId: session.user.id,
    action: TaskHistoryAction.STEP_DELETED,
    message: `${session.user.name || session.user.email || 'Admin'} deleted Step ${stepRecord.order}.`,
    before: {
      order: stepRecord.order,
      description: stepRecord.description,
      expectedResult: stepRecord.expectedResult,
      testData: stepRecord.testData
    }
  });

  const remainingSteps = await prisma.taskStep.findMany({
    where: { taskId: id },
    orderBy: { order: 'asc' }
  });

  await prisma.$transaction(
    remainingSteps.map((step, index) =>
      prisma.taskStep.update({
        where: { id: step.id },
        data: { order: index + 1 }
      })
    )
  );

  await prisma.task.update({
    where: { id },
    data: {
      updatedById: session.user.id
    }
  });

  return NextResponse.json({ ok: true });
}
