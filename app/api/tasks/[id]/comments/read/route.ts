import { NextResponse } from 'next/server';
import prisma from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const task = await prisma.task.findUnique({
    where: { id }
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

  const comments = await prisma.comment.findMany({
    where: {
      taskId: id,
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
      taskId: id,
      type: 'COMMENT_ADDED'
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

  return NextResponse.json({ ok: true });
}
