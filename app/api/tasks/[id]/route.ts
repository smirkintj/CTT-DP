import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { mapTaskToUi } from '../_mappers';
import { sendTaskAssignedEmail } from '../../../../lib/email';
import { ActivityType, TaskHistoryAction, UserRole } from '@prisma/client';
import { validateExpectedUpdatedAt } from '../../../../lib/taskGuards';
import { createTaskHistory } from '../../../../lib/taskHistory';
import { badRequest, conflict, forbidden, internalError, notFound, unauthorized } from '../../../../lib/apiError';
import { isValidDueDate, isValidJiraTicket } from '../../../../lib/taskValidation';
import { taskRelationIncludeFull, taskRelationIncludeSafe } from '../_query';
import { randomUUID } from 'crypto';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const { id } = await params;

  if (!id) {
    return badRequest('Missing id', 'TASK_ID_MISSING');
  }

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  let task: any = null;
  try {
    try {
      task = await prisma.task.findUnique({
        where: { id },
        include: taskRelationIncludeFull
      });
    } catch {
      task = await prisma.task.findUnique({
        where: { id },
        include: taskRelationIncludeSafe
      });
    }
  } catch (error) {
    try {
      const minimalTask = await prisma.task.findUnique({
        where: { id }
      });
      if (!minimalTask) {
        return notFound('Not found', 'TASK_NOT_FOUND');
      }

      const isAdmin = session.user.role === 'ADMIN';
      if (!isAdmin) {
        const userCountry = session.user.countryCode;
        if (!userCountry || minimalTask.countryCode !== userCountry || minimalTask.assigneeId !== session.user.id) {
          return forbidden('Forbidden', 'TASK_FORBIDDEN');
        }
      }

      return NextResponse.json(
        mapTaskToUi({
          ...minimalTask,
          country: null,
          assignee: null,
          updatedBy: null,
          signedOffBy: null,
          comments: [],
          steps: []
        }),
        {
          headers: {
            'X-Query-Time-Ms': String(Date.now() - startedAt)
          }
        }
      );
    } catch (fallbackError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('GET /api/tasks/[id] fallback failed:', fallbackError);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.error('GET /api/tasks/[id] failed:', error);
      const detail = error instanceof Error ? error.message : 'Unknown error';
      return internalError('Failed to fetch task', 'TASK_FETCH_FAILED', detail);
    }
    return internalError('Failed to fetch task', 'TASK_FETCH_FAILED');
  }

  if (!task) {
    return notFound('Not found', 'TASK_NOT_FOUND');
  }

  const isAdmin = session.user.role === 'ADMIN';

  if (!isAdmin) {
    const userCountry = session.user.countryCode;
    if (!userCountry || task.countryCode !== userCountry) {
      return forbidden('Forbidden', 'TASK_FORBIDDEN');
    }

    if (task.assigneeId !== session.user.id) {
      return forbidden('Forbidden', 'TASK_FORBIDDEN');
    }
  }

  const durationMs = Date.now() - startedAt;
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[perf] GET /api/tasks/${id} ${durationMs}ms`);
  }
  return NextResponse.json(mapTaskToUi(task), {
    headers: {
      'X-Query-Time-Ms': String(durationMs)
    }
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return badRequest('Missing id', 'TASK_ID_MISSING');
  }

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  if (session.user.role !== 'ADMIN') {
    return forbidden('Forbidden', 'ADMIN_REQUIRED');
  }

  const body = await req.json().catch(() => null);
  const applyToGroup = body?.applyToGroup === true;
  const existingTask = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: {
        select: {
          id: true,
          email: true,
          name: true
        }
      },
      updatedBy: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    }
  });

  if (!existingTask) {
    return notFound('Not found', 'TASK_NOT_FOUND');
  }

  if (existingTask.signedOffAt) {
    return conflict('Task is signed off and locked', 'TASK_LOCKED');
  }

  const staleMessage = validateExpectedUpdatedAt(existingTask.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return conflict(staleMessage, 'TASK_STALE');
  }

  const nextDueDate =
    typeof body?.dueDate === 'string' && body.dueDate
      ? new Date(body.dueDate)
      : undefined;
  const hasValidDueDate = !nextDueDate || !Number.isNaN(nextDueDate.getTime());
  if (typeof body?.title === 'string' && body.title.trim().length === 0) {
    return badRequest('Title is required', 'TASK_TITLE_REQUIRED');
  }
  if (typeof body?.title === 'string' && body.title.length > 200) {
    return badRequest('Title is too long', 'TASK_TITLE_TOO_LONG');
  }
  if (!isValidJiraTicket(body?.jiraTicket)) {
    return badRequest('Invalid Jira ticket format', 'TASK_JIRA_INVALID');
  }
  if (!isValidDueDate(body?.dueDate)) {
    return badRequest('Invalid due date', 'TASK_DUE_DATE_INVALID');
  }

  const hasGlobalFieldInput =
    Object.prototype.hasOwnProperty.call(body ?? {}, 'title') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'description') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'jiraTicket') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'crNumber') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'developer') ||
    Object.prototype.hasOwnProperty.call(body ?? {}, 'dueDate');

  let nextAssigneeId: string | null | undefined = undefined;
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'assigneeId')) {
    if (body?.assigneeId === null || body?.assigneeId === '') {
      if (existingTask.status !== 'DRAFT') {
        return badRequest(
          'Cannot remove assignee after task is no longer draft',
          'TASK_ASSIGNEE_REQUIRED'
        );
      }
      nextAssigneeId = null;
    } else if (typeof body?.assigneeId === 'string') {
      const assignee = await prisma.user.findFirst({
        where: {
          id: body.assigneeId,
          role: UserRole.STAKEHOLDER,
          isActive: true,
          countryCode: existingTask.countryCode
        },
        select: { id: true }
      });
      if (!assignee) {
        return badRequest('Invalid assignee for task country', 'TASK_ASSIGNEE_INVALID');
      }
      nextAssigneeId = assignee.id;
    } else {
      return badRequest('Invalid assignee id', 'TASK_ASSIGNEE_INVALID');
    }
  }
  const data: Record<string, unknown> = {
    title: body?.title ?? undefined,
    description: body?.description ?? undefined,
    jiraTicket: body?.jiraTicket ?? undefined,
    crNumber: body?.crNumber ?? undefined,
    dueDate: hasValidDueDate ? nextDueDate : undefined,
    priority: body?.priority ?? undefined,
    module: body?.module ?? body?.featureModule ?? undefined,
    assigneeId: nextAssigneeId,
    updatedById: session.user.id
  };
  if (typeof body?.developer !== 'undefined') {
    data.developer = body.developer;
  }

  const globalData: Record<string, unknown> = {
    updatedById: session.user.id
  };
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'title')) {
    globalData.title = body?.title ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'description')) {
    globalData.description = body?.description ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'jiraTicket')) {
    globalData.jiraTicket = body?.jiraTicket ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'crNumber')) {
    globalData.crNumber = body?.crNumber ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'developer')) {
    globalData.developer = body?.developer;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'dueDate')) {
    globalData.dueDate = hasValidDueDate ? nextDueDate : undefined;
  }

  let task: any;
  try {
    task = await prisma.task.update({
      where: { id },
      data,
      include: {
        ...taskRelationIncludeFull
      }
    });
  } catch {
    const fallbackData: any = {
      title: body?.title ?? undefined,
      description: body?.description ?? undefined,
      jiraTicket: body?.jiraTicket ?? undefined,
      crNumber: body?.crNumber ?? undefined,
      dueDate: hasValidDueDate ? nextDueDate : undefined,
      priority: body?.priority ?? undefined,
      module: body?.module ?? body?.featureModule ?? undefined,
      assigneeId: nextAssigneeId
    };

    task = await prisma.task.update({
      where: { id },
      data: fallbackData,
      include: {
        ...taskRelationIncludeSafe
      }
    });
  }

  const nextAssignee = task.assignee;
  const assignmentChanged =
    typeof body?.assigneeId === 'string' && body.assigneeId !== existingTask.assigneeId;
  const shouldSendAssignmentEmail = assignmentChanged && nextAssignee?.email && task.status !== 'DRAFT';
  let assigneeAllowsAssignmentEmail = true;
  if (shouldSendAssignmentEmail && nextAssignee?.id) {
    const assigneePref = await prisma.user.findUnique({
      where: { id: nextAssignee.id },
      select: { notifyOnAssignmentEmail: true }
    });
    assigneeAllowsAssignmentEmail = assigneePref?.notifyOnAssignmentEmail !== false;
  }

  if (shouldSendAssignmentEmail && nextAssignee?.email && assigneeAllowsAssignmentEmail) {
    await sendTaskAssignedEmail({
      to: nextAssignee.email,
      assigneeName: nextAssignee.name ?? undefined,
      taskTitle: task.title,
      taskId: task.id,
      countryCode: task.countryCode,
      dueDate: task.dueDate
    });
  }

  const hasMetaChanges =
    existingTask.title !== task.title ||
    (existingTask.description ?? '') !== (task.description ?? '') ||
    (existingTask.jiraTicket ?? '') !== (task.jiraTicket ?? '') ||
    (existingTask.crNumber ?? '') !== (task.crNumber ?? '') ||
    (existingTask.developer ?? '') !== (task.developer ?? '') ||
    (existingTask.module ?? '') !== (task.module ?? '') ||
    (existingTask.priority ?? '') !== (task.priority ?? '') ||
    (existingTask.dueDate?.toISOString() ?? '') !== (task.dueDate?.toISOString() ?? '');

  if (hasMetaChanges) {
    await prisma.activity.create({
      data: {
        type: ActivityType.STATUS_CHANGED,
        taskId: task.id,
        actorId: session.user.id,
        countryCode: task.countryCode,
        message: `${session.user.name || session.user.email || 'Admin'} updated task details for "${task.title}".`
      }
    });

    await createTaskHistory({
      taskId: task.id,
      actorId: session.user.id,
      action: TaskHistoryAction.TASK_UPDATED,
      message: `${session.user.name || session.user.email || 'Admin'} updated task details.`,
      before: {
        title: existingTask.title,
        description: existingTask.description,
        jiraTicket: existingTask.jiraTicket,
        crNumber: existingTask.crNumber,
        developer: existingTask.developer,
        module: existingTask.module,
        priority: existingTask.priority,
        dueDate: existingTask.dueDate?.toISOString() ?? null,
        assigneeId: existingTask.assigneeId ?? null
      },
      after: {
        title: task.title,
        description: task.description,
        jiraTicket: task.jiraTicket,
        crNumber: task.crNumber,
        developer: task.developer,
        module: task.module,
        priority: task.priority,
        dueDate: task.dueDate?.toISOString() ?? null,
        assigneeId: task.assigneeId ?? null
      }
    });
  }

  let globalUpdateSummary:
    | {
        requested: boolean;
        taskGroupId: string | null;
        total: number;
        updated: number;
        skippedSignedOff: number;
        skipped: Array<{ taskId: string; countryCode: string; reason: 'SIGNED_OFF' }>;
        operationId?: string;
      }
    | undefined;

  if (applyToGroup) {
    if (!existingTask.taskGroupId) {
      globalUpdateSummary = {
        requested: true,
        taskGroupId: null,
        total: 1,
        updated: 1,
        skippedSignedOff: 0,
        skipped: []
      };
    } else if (!hasGlobalFieldInput) {
      const groupCount = await prisma.task.count({
        where: { taskGroupId: existingTask.taskGroupId }
      });
      globalUpdateSummary = {
        requested: true,
        taskGroupId: existingTask.taskGroupId,
        total: groupCount,
        updated: 1,
        skippedSignedOff: 0,
        skipped: []
      };
    } else {
      const groupTasks = await prisma.task.findMany({
        where: { taskGroupId: existingTask.taskGroupId },
        select: {
          id: true,
          title: true,
          countryCode: true,
          signedOffAt: true,
          description: true,
          jiraTicket: true,
          crNumber: true,
          developer: true,
          dueDate: true
        },
        orderBy: { countryCode: 'asc' }
      });
      const operationId = randomUUID();
      const skipped: Array<{ taskId: string; countryCode: string; reason: 'SIGNED_OFF' }> = [];
      let updatedCount = 1; // source task update already applied

      for (const groupTask of groupTasks) {
        if (groupTask.id === task.id) continue;
        if (groupTask.signedOffAt) {
          skipped.push({
            taskId: groupTask.id,
            countryCode: groupTask.countryCode,
            reason: 'SIGNED_OFF'
          });
          continue;
        }

        const updatedGroupTask = await prisma.task.update({
          where: { id: groupTask.id },
          data: globalData,
          select: {
            id: true,
            title: true,
            description: true,
            jiraTicket: true,
            crNumber: true,
            developer: true,
            dueDate: true,
            countryCode: true
          }
        });

        updatedCount += 1;

        await createTaskHistory({
          taskId: groupTask.id,
          actorId: session.user.id,
          action: TaskHistoryAction.TASK_UPDATED,
          message: `${session.user.name || session.user.email || 'Admin'} applied global task update across markets.`,
          before: {
            title: groupTask.title,
            description: groupTask.description,
            jiraTicket: groupTask.jiraTicket,
            crNumber: groupTask.crNumber,
            developer: groupTask.developer,
            dueDate: groupTask.dueDate?.toISOString() ?? null
          },
          after: {
            title: updatedGroupTask.title,
            description: updatedGroupTask.description,
            jiraTicket: updatedGroupTask.jiraTicket,
            crNumber: updatedGroupTask.crNumber,
            developer: updatedGroupTask.developer,
            dueDate: updatedGroupTask.dueDate?.toISOString() ?? null
          },
          metadata: {
            operationId,
            sourceTaskId: task.id,
            taskGroupId: existingTask.taskGroupId,
            globalUpdate: true
          }
        });
      }

      globalUpdateSummary = {
        requested: true,
        taskGroupId: existingTask.taskGroupId,
        total: groupTasks.length,
        updated: updatedCount,
        skippedSignedOff: skipped.length,
        skipped,
        operationId
      };
    }
  }

  return NextResponse.json({
    ...mapTaskToUi(task),
    globalUpdateSummary
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return badRequest('Missing id', 'TASK_ID_MISSING');
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  if (session.user.role !== 'ADMIN') {
    return forbidden('Forbidden', 'ADMIN_REQUIRED');
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, title: true, countryCode: true }
  });

  if (!task) {
    return notFound('Not found', 'TASK_NOT_FOUND');
  }

  await createTaskHistory({
    taskId: id,
    actorId: session.user.id,
    action: TaskHistoryAction.TASK_DELETED,
    message: `${session.user.name || session.user.email || 'Admin'} deleted "${task.title}".`,
    before: {
      title: task.title,
      countryCode: task.countryCode
    }
  });

  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { taskId: id } }),
    prisma.taskStep.deleteMany({ where: { taskId: id } }),
    prisma.activity.deleteMany({ where: { taskId: id } }),
    prisma.task.delete({ where: { id } })
  ]);

  return NextResponse.json({ ok: true });
}
