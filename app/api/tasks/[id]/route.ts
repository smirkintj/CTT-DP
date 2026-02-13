import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { mapTaskToUi } from '../_mappers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await prisma.task.findUnique({
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

  const data = {
    jiraTicket: body?.jiraTicket ?? undefined,
    developer: body?.developer ?? undefined,
    dueDate: body?.dueDate ? new Date(body.dueDate) : undefined,
    priority: body?.priority ?? undefined,
    module: body?.module ?? body?.featureModule ?? undefined,
    updatedById: session.user.id
  };

  const task = await prisma.task.update({
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

  return NextResponse.json(mapTaskToUi(task));
}
