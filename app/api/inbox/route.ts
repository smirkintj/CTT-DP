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
  const comments = await prisma.comment.findMany({
    where: isAdmin
      ? {
          authorId: { not: session.user.id },
          reads: {
            none: {
              userId: session.user.id
            }
          }
        }
      : {
          authorId: { not: session.user.id },
          task: { assigneeId: session.user.id },
          reads: {
            none: {
              userId: session.user.id
            }
          }
        },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          countryCode: true,
          status: true,
          assigneeId: true
        }
      },
      author: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    },
    take: 200
  });

  const groupedMap = new Map<
    string,
    {
      taskId: string;
      taskTitle: string;
      countryCode: string;
      status: string;
      assigneeId: string | null;
      unreadCount: number;
      latestMessage: string;
      latestAt: string;
      latestStepOrder: number | null;
      latestCommentId: string;
    }
  >();

  for (const comment of comments) {
    if (!comment.task) continue;
    const taskId = comment.taskId;

    const existing = groupedMap.get(taskId);
    const authorName = comment.author.name || comment.author.email || 'User';
    const preview = `${authorName}: ${comment.body}`;

    if (!existing) {
      groupedMap.set(taskId, {
        taskId,
        taskTitle: comment.task.title,
        countryCode: comment.task.countryCode,
        status: comment.task.status,
        assigneeId: comment.task.assigneeId,
        unreadCount: 1,
        latestMessage: preview,
        latestAt: comment.createdAt.toISOString(),
        latestStepOrder: typeof comment.stepOrder === 'number' ? comment.stepOrder : null,
        latestCommentId: comment.id
      });
      continue;
    }

    existing.unreadCount += 1;
  }

  const items = Array.from(groupedMap.values()).sort(
    (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime()
  );

  return NextResponse.json(items);
}
