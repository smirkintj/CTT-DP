import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { mapTaskToUi } from './_mappers';
import { ActivityType, TaskPriority, TaskStatus, UserRole } from '@prisma/client';
import { sendTaskAssignedEmail } from '../../../lib/email';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = session.user.role === 'ADMIN';

  let tasks: any[] = [];
  try {
    tasks = await prisma.task.findMany({
      where: isAdmin ? undefined : { assigneeId: session.user.id },
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
      where: isAdmin ? undefined : { assigneeId: session.user.id },
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
