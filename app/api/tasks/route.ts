import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { mapTaskToUi } from './_mappers';
import { ActivityType, TaskHistoryAction, TaskPriority, TaskStatus, UserRole } from '@prisma/client';
import { sendTaskAssignedEmail } from '../../../lib/email';
import { sendTeamsMessage } from '../../../lib/teams';
import { createTaskHistory } from '../../../lib/taskHistory';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const where = isAdmin ? undefined : { assigneeId: session.user.id };
  try {
    let tasks: any[] = [];
    try {
      tasks = await prisma.task.findMany({
        where,
        include: {
          country: true,
          assignee: {
            select: {
              id: true,
              email: true,
              countryCode: true,
              name: true
            }
          },
          updatedBy: {
            select: {
              id: true,
              email: true,
              name: true
            }
          },
          signedOffBy: {
            select: {
              id: true,
              email: true,
              name: true
            }
          },
          comments: {
            include: {
              author: {
                select: {
                  id: true,
                  email: true,
                  name: true
                }
              }
            }
          },
          steps: {
            orderBy: {
              order: 'asc'
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
    } catch {
      tasks = await prisma.task.findMany({
        where,
        include: {
          country: true,
          assignee: {
            select: {
              id: true,
              email: true,
              countryCode: true,
              name: true
            }
          },
          comments: {
            include: {
              author: {
                select: {
                  id: true,
                  email: true,
                  name: true
                }
              }
            }
          },
          steps: {
            orderBy: {
              order: 'asc'
            }
          }
        },
        orderBy: {
          updatedAt: 'desc'
        }
      });
    }

    const mapped = tasks.map(mapTaskToUi);

    return NextResponse.json(mapped, {
      headers: {
        'Cache-Control': 'no-store'
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

      return NextResponse.json(mappedMinimal, {
        headers: {
          'Cache-Control': 'no-store'
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
      return NextResponse.json({ error: 'Failed to fetch tasks', detail }, { status: 500 });
    }
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (countries.length === 0) {
    return NextResponse.json({ error: 'At least one country is required' }, { status: 400 });
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
        status: TaskStatus.READY,
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
        status: TaskStatus.READY,
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

    if (assignee?.email) {
      await prisma.activity.create({
        data: {
          type: ActivityType.TASK_ASSIGNED,
          taskId: created.id,
          actorId: session.user.id,
          countryCode,
          message: `Admin assigned "${title}" to ${assignee.email}.`
        }
      });

      await sendTaskAssignedEmail({
        to: assignee.email,
        assigneeName: assignee.name ?? undefined,
        taskTitle: title,
        taskId: created.id,
        countryCode,
        dueDate
      });

      void sendTeamsMessage({
        countryCode,
        eventType: 'TASK_ASSIGNED',
        title: `New UAT Task Assigned (${countryCode})`,
        text: `Task "${title}" has been assigned to ${assignee.name || assignee.email}.`,
        taskId: created.id,
        facts: [
          { name: 'Assignee', value: assignee.name || assignee.email },
          { name: 'Country', value: countryCode },
          { name: 'Due Date', value: dueDate ? new Date(dueDate).toLocaleDateString() : 'N/A' }
        ]
      });
    }
  }

  const createdTasks = await prisma.task.findMany({
    where: {
      id: { in: createdTaskIds }
    },
    include: {
      country: true,
      assignee: {
        select: {
          id: true,
          email: true,
          countryCode: true,
          name: true
        }
      },
      comments: {
        include: {
          author: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      },
      steps: {
        orderBy: {
          order: 'asc'
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  return NextResponse.json(createdTasks.map(mapTaskToUi), { status: 201 });
}
