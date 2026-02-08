import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { mapTaskToUi } from '../_mappers';

interface Params {
  params: { id: string };
}

export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await prisma.task.findUnique({
    where: { id: params.id },
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
  }

  if (!isAdmin && task.assigneeId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json(mapTaskToUi(task), {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
