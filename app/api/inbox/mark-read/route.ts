import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { badRequest, unauthorized } from '../../../../lib/apiError';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  const body = await req.json().catch(() => null);
  const taskId = body?.taskId as string | undefined;
  const markAll = body?.all === true;

  if (!taskId && !markAll) {
    return badRequest('Invalid payload', 'INBOX_MARK_READ_INVALID');
  }

  const isAdmin = session.user.role === 'ADMIN';

  const taskIds = markAll
    ? (
        await prisma.task.findMany({
          where: isAdmin ? undefined : { assigneeId: session.user.id },
          select: { id: true }
        })
      ).map((task) => task.id)
    : taskId
      ? [taskId]
      : [];

  if (taskIds.length > 0) {
    const comments = await prisma.comment.findMany({
      where: {
        taskId: { in: taskIds },
        authorId: { not: session.user.id }
      },
      select: { id: true }
    });

    if (comments.length > 0) {
      await prisma.commentRead.createMany({
        data: comments.map((comment) => ({
          commentId: comment.id,
          userId: session.user.id
        })),
        skipDuplicates: true
      });
    }

    const activities = await prisma.activity.findMany({
      where: {
        type: 'COMMENT_ADDED',
        taskId: { in: taskIds }
      },
      select: { id: true }
    });

    if (activities.length > 0) {
      await prisma.activityRead.createMany({
        data: activities.map((activity) => ({
          activityId: activity.id,
          userId: session.user.id
        })),
        skipDuplicates: true
      });
    }
  }

  return NextResponse.json({ ok: true });
}
