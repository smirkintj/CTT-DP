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
          // Country-scoped task activity only — excludes admin-only audit entries
          // (created via createAdminAudit, e.g. user/product management), which are
          // never attached to a task and shouldn't appear in a stakeholder's feed.
          ...(session.user.countryCode
            ? [{ countryCode: session.user.countryCode, taskId: { not: null } }]
            : [])
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
      },
      reads: {
        where: { userId: session.user.id },
        select: { activityId: true }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 50
  });

  return NextResponse.json(
    activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      message: activity.message,
      taskId: activity.taskId,
      createdAt: activity.createdAt.toISOString(),
      isRead: activity.reads.length > 0
    }))
  );
}
