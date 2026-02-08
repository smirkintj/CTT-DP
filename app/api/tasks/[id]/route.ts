import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getAuthSession } from '../../../../lib/auth';
import { mapTaskToUi } from '../_mappers';

interface Params {
  params: { id: string };
}

export async function GET(_: Request, { params }: Params) {
  const session = await getAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      country: true,
      assignee: true,
      comments: {
        include: {
          author: true
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
  if (!isAdmin && task.assigneeId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(mapTaskToUi(task), {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
