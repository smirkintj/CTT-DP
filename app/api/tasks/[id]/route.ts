import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { mapTaskToUi } from '../_mappers';
import { sendTaskAssignedEmail } from '../../../../lib/email';
import { ActivityType } from '@prisma/client';
import { validateExpectedUpdatedAt } from '../../../../lib/taskGuards';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let task: any = null;
  try {
    task = await prisma.task.findUnique({
      where: { id },
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
        steps: {
          orderBy: {
            order: 'asc'
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
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });
  } catch {
    task = await prisma.task.findUnique({
      where: { id },
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
        steps: {
          orderBy: {
            order: 'asc'
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
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });
  }

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isAdmin = session.user.role === 'ADMIN';

  if (!isAdmin) {
    const userCountry = session.user.countryCode;
    if (!userCountry || task.countryCode !== userCountry) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (task.assigneeId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  return NextResponse.json(mapTaskToUi(task));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
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
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (existingTask.signedOffAt) {
    return NextResponse.json({ error: 'Task is signed off and locked' }, { status: 409 });
  }

  const staleMessage = validateExpectedUpdatedAt(existingTask.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return NextResponse.json({ error: staleMessage }, { status: 409 });
  }

  const nextDueDate =
    typeof body?.dueDate === 'string' && body.dueDate
      ? new Date(body.dueDate)
      : undefined;
  const hasValidDueDate = !nextDueDate || !Number.isNaN(nextDueDate.getTime());
  const data: Record<string, unknown> = {
    title: body?.title ?? undefined,
    description: body?.description ?? undefined,
    jiraTicket: body?.jiraTicket ?? undefined,
    crNumber: body?.crNumber ?? undefined,
    dueDate: hasValidDueDate ? nextDueDate : undefined,
    priority: body?.priority ?? undefined,
    module: body?.module ?? body?.featureModule ?? undefined,
    assigneeId: body?.assigneeId ?? undefined,
    updatedById: session.user.id
  };
  if (typeof body?.developer !== 'undefined') {
    data.developer = body.developer;
  }

  let task: any;
  try {
    task = await prisma.task.update({
      where: { id },
      data,
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
        steps: {
          orderBy: {
            order: 'asc'
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
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
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
      assigneeId: body?.assigneeId ?? undefined
    };

    task = await prisma.task.update({
      where: { id },
      data: fallbackData,
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
        steps: {
          orderBy: {
            order: 'asc'
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
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });
  }

  const nextAssignee = task.assignee;
  const assignmentChanged =
    typeof body?.assigneeId === 'string' && body.assigneeId !== existingTask.assigneeId;
  if (assignmentChanged && nextAssignee?.email) {
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
  }

  return NextResponse.json(mapTaskToUi(task));
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true }
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { taskId: id } }),
    prisma.taskStep.deleteMany({ where: { taskId: id } }),
    prisma.activity.deleteMany({ where: { taskId: id } }),
    prisma.task.delete({ where: { id } })
  ]);

  return NextResponse.json({ ok: true });
}
