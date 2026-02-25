import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { unauthorized } from '../../../lib/apiError';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  const isAdmin = session.user.role === 'ADMIN';
  const where = isAdmin
    ? {}
    : {
        OR: [
          { actorId: session.user.id },
          { task: { assigneeId: session.user.id } },
          ...(session.user.countryCode ? [{ countryCode: session.user.countryCode }] : [])
        ]
      };

  const activities = await prisma.activity.findMany({
    where,
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
    take: 50
  });

  const readRows = await prisma.activityRead.findMany({
    where: {
      userId: session.user.id,
      activityId: { in: activities.map((item) => item.id) }
    },
    select: {
      activityId: true
    }
  });

  const readSet = new Set(readRows.map((item) => item.activityId));

  return NextResponse.json(
    activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      message: activity.message,
      taskId: activity.taskId,
      createdAt: activity.createdAt.toISOString(),
      isRead: readSet.has(activity.id)
    }))
  );
}
