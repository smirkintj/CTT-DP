import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { mapTaskToUi } from './_mappers';
import { ActivityType, TaskHistoryAction, TaskPriority, TaskStatus, UserRole } from '@prisma/client';
import { createTaskHistory } from '../../../lib/taskHistory';
import { badRequest, forbidden, internalError, unauthorized } from '../../../lib/apiError';
import { isValidDueDate, isValidJiraTicket } from '../../../lib/taskValidation';
import { taskRelationIncludeList, taskRelationIncludeSafe } from './_query';

export async function GET() {
  const startedAt = Date.now();
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && !session.user.id) {
    return unauthorized('Unauthorized', 'AUTH_INVALID_SESSION');
  }

  const where = isAdmin ? undefined : { assigneeId: session.user.id };
  try {
    let tasks: any[] = [];
    try {
      tasks = await prisma.task.findMany({
        where,
        include: taskRelationIncludeList,
        orderBy: {
          updatedAt: 'desc'
        }
      });
    } catch {
      tasks = await prisma.task.findMany({
        where,
        include: taskRelationIncludeSafe,
        orderBy: {
          updatedAt: 'desc'
        }
      });
    }

    const mapped = tasks.map(mapTaskToUi);
    const durationMs = Date.now() - startedAt;
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[perf] GET /api/tasks ${durationMs}ms (rows=${mapped.length})`);
    }

    return NextResponse.json(mapped, {
      headers: {
        'Cache-Control': 'private, max-age=5',
        'X-Query-Time-Ms': String(durationMs)
      }
    });
  } catch (error) {
    try {
      // Last-resort fallback so dashboards remain usable even if relation includes fail.
      const minimalTasks = await prisma.task.findMany({
        where,
        orderBy: { updatedAt: 'desc' }
      });

      const mappedMinimal = minimalTasks.map((task) =>
        mapTaskToUi({
          ...task,
          country: null,
          assignee: null,
          updatedBy: null,
          signedOffBy: null,
          comments: [],
          steps: []
        })
      );
      const durationMs = Date.now() - startedAt;
      if (process.env.NODE_ENV !== 'production') {
        console.info(`[perf] GET /api/tasks fallback ${durationMs}ms (rows=${mappedMinimal.length})`);
      }

      return NextResponse.json(mappedMinimal, {
        headers: {
          'Cache-Control': 'private, max-age=5',
          'X-Query-Time-Ms': String(durationMs)
        }
      });
    } catch (fallbackError) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('GET /api/tasks fallback failed:', fallbackError);
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.error('GET /api/tasks failed:', error);
      const detail = error instanceof Error ? error.message : 'Unknown error';
      return internalError('Failed to fetch tasks', 'TASKS_FETCH_FAILED', detail);
    }
    return internalError('Failed to fetch tasks', 'TASKS_FETCH_FAILED');
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  if (session.user.role !== 'ADMIN') {
    return forbidden('Forbidden', 'ADMIN_REQUIRED');
  }

  const body = await req.json().catch(() => null);
  const title = body?.title?.toString().trim();
  const description = body?.description?.toString() ?? '';
  const moduleName = body?.module?.toString().trim() || body?.featureModule?.toString().trim() || 'General';
  const jiraTicket = body?.jiraTicket?.toString().trim() || null;
  const crNumber = body?.crNumber?.toString().trim() || null;
  const developer = body?.developer?.toString().trim() || null;
  const dueDateRaw = body?.dueDate as string | undefined;
  const priorityRaw = body?.priority?.toString().toUpperCase() as TaskPriority | undefined;
  const countries = Array.isArray(body?.countries) ? (body.countries as string[]) : [];
  const assigneeByCountry =
    body?.assigneeByCountry && typeof body.assigneeByCountry === 'object'
      ? (body.assigneeByCountry as Record<string, string | undefined>)
      : {};
  const steps = Array.isArray(body?.steps) ? body.steps : [];

  if (!title) {
    return badRequest('Title is required', 'TASK_TITLE_REQUIRED');
  }
  if (title.length > 200) {
    return badRequest('Title is too long', 'TASK_TITLE_TOO_LONG');
  }
  if (countries.length === 0) {
    return badRequest('At least one country is required', 'TASK_COUNTRY_REQUIRED');
  }
  if (!isValidJiraTicket(body?.jiraTicket)) {
    return badRequest('Invalid Jira ticket format', 'TASK_JIRA_INVALID');
  }
  if (!isValidDueDate(dueDateRaw)) {
    return badRequest('Invalid due date', 'TASK_DUE_DATE_INVALID');
  }

  const invalidStep = steps.some(
    (step: any) => !step?.description?.toString()?.trim() || !step?.expectedResult?.toString()?.trim()
  );
  if (steps.length > 0 && invalidStep) {
    return badRequest('Each step must include description and expected result', 'TASK_STEP_INVALID');
  }

  const priority: TaskPriority =
    priorityRaw && Object.values(TaskPriority).includes(priorityRaw) ? priorityRaw : TaskPriority.MEDIUM;
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;

  const createdTaskIds: string[] = [];

  for (const countryCode of countries) {
    const selectedAssigneeId = assigneeByCountry[countryCode];
    let assignee = null;

    if (selectedAssigneeId) {
      assignee = await prisma.user.findFirst({
        where: {
          id: selectedAssigneeId,
          role: UserRole.STAKEHOLDER,
          isActive: true,
          countryCode
        },
        select: {
          id: true,
          email: true,
          name: true
        }
      });
    }

    if (!assignee) {
      assignee = await prisma.user.findFirst({
        where: {
          role: UserRole.STAKEHOLDER,
          isActive: true,
          countryCode
        },
        select: {
          id: true,
          email: true,
          name: true
        }
      });
    }

    const created = await prisma.task.create({
      data: {
        title,
        description,
        jiraTicket,
        crNumber,
        developer,
        module: moduleName,
        status: TaskStatus.DRAFT,
        priority,
        countryCode,
        dueDate,
        assigneeId: assignee?.id ?? null,
        updatedById: session.user.id
      },
      select: { id: true }
    });

    createdTaskIds.push(created.id);

    await createTaskHistory({
      taskId: created.id,
      actorId: session.user.id,
      action: TaskHistoryAction.TASK_CREATED,
      message: `${session.user.name || session.user.email || 'Admin'} created "${title}" for ${countryCode}.`,
      after: {
        title,
        description,
        jiraTicket,
        crNumber,
        developer,
        module: moduleName,
        status: TaskStatus.DRAFT,
        priority,
        countryCode,
        dueDate: dueDate ? dueDate.toISOString() : null,
        assigneeId: assignee?.id ?? null
      }
    });

    if (steps.length > 0) {
      await prisma.taskStep.createMany({
        data: steps
          .filter((step: any) => !step?.countryFilter || step.countryFilter === 'ALL' || step.countryFilter === countryCode)
          .map((step: any, index: number) => ({
            taskId: created.id,
            order: index + 1,
            description: (step?.description || '').toString(),
            expectedResult: (step?.expectedResult || '').toString(),
            testData: step?.testData ? step.testData.toString() : null
          }))
      });
    }

    await prisma.activity.create({
      data: {
        type: ActivityType.STATUS_CHANGED,
        taskId: created.id,
        actorId: session.user.id,
        countryCode,
        message: `Admin created draft task "${title}" for ${countryCode}.`
      }
    });
  }

  const createdTasks = await prisma.task.findMany({
    where: {
      id: { in: createdTaskIds }
    },
    include: taskRelationIncludeSafe,
    orderBy: {
      createdAt: 'desc'
    }
  });

  return NextResponse.json(createdTasks.map(mapTaskToUi), { status: 201 });
}
