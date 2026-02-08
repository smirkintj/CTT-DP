import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { mapTaskToUi } from './_mappers';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = session.user.role === 'ADMIN';

  const tasks = await prisma.task.findMany({
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
      }
    },
    orderBy: {
      updatedAt: 'desc'
    }
  });

  const mapped = tasks.map(mapTaskToUi);

  return NextResponse.json(mapped, {
    headers: {
      'Cache-Control': 'no-store'
    }
  });
}
