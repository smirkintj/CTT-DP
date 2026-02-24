import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getAuthSession } from '../../../../../lib/auth';
import { createActivity } from '../../../../../lib/activity';
import { ActivityType } from '@prisma/client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const text = body?.body as string | undefined;
  const stepOrder = typeof body?.stepOrder === 'number' ? body.stepOrder : undefined;

  if (!text || !text.trim()) {
    return NextResponse.json({ error: 'Invalid comment' }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id }
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (task.signedOffAt) {
    return NextResponse.json({ error: 'Task is signed off and locked' }, { status: 409 });
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const created = await prisma.comment.create({
    data: {
      taskId: id,
      authorId: session.user.id,
      body: text.trim(),
      stepOrder: stepOrder && stepOrder > 0 ? stepOrder : null
    }
  });

  try {
    await prisma.commentRead.create({
      data: {
        commentId: created.id,
        userId: session.user.id
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('commentRead create failed:', error);
    }
  }

  try {
    await createActivity({
      type: ActivityType.COMMENT_ADDED,
      message:
        stepOrder && stepOrder > 0
          ? `${session.user.name || session.user.email} added a comment on Step ${stepOrder} in ${task.title}.`
          : `${session.user.name || session.user.email} added a comment on ${task.title}.`,
      taskId: id,
      actorId: session.user.id,
      countryCode: task.countryCode
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('activity create failed:', error);
    }
  }

  return NextResponse.json({ ok: true, id: created.id });
}
