import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';

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
    select: {
      id: true,
      assigneeId: true,
      countryCode: true
    }
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  try {
    const history = await prisma.taskHistory.findMany({
      where: { taskId: id },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 100
    });

    return NextResponse.json(
      history.map((item) => ({
        id: item.id,
        action: item.action,
        message: item.message,
        createdAt: item.createdAt.toISOString(),
        actor: item.actor
          ? {
              id: item.actor.id,
              name: item.actor.name,
              email: item.actor.email
            }
          : null,
        before: item.before ?? null,
        after: item.after ?? null,
        metadata: item.metadata ?? null
      })),
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('GET /api/tasks/[id]/history failed:', error);
    }
    return NextResponse.json([], {
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  }
}
