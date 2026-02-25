import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { validateExpectedUpdatedAt } from '../../../../../lib/taskGuards';
import { createTaskHistory } from '../../../../../lib/taskHistory';
import { TaskHistoryAction } from '@prisma/client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const description = body?.description as string | undefined;
  const expectedResult = body?.expectedResult as string | undefined;
  const testData = body?.testData as string | undefined;

  if (!description || !expectedResult) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
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

  const staleMessage = validateExpectedUpdatedAt(task.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return NextResponse.json({ error: staleMessage }, { status: 409 });
  }

  const lastStep = await prisma.taskStep.findFirst({
    where: { taskId: id },
    orderBy: { order: 'desc' }
  });
  const nextOrder = (lastStep?.order ?? 0) + 1;

  const step = await prisma.taskStep.create({
    data: {
      taskId: id,
      order: nextOrder,
      description,
      expectedResult,
      testData: testData ?? null
    }
  });

  await prisma.task.update({
    where: { id },
    data: {
      updatedById: session.user.id
    }
  });

  await createTaskHistory({
    taskId: id,
    actorId: session.user.id,
    action: TaskHistoryAction.STEP_CREATED,
    message: `${session.user.name || session.user.email || 'Admin'} added Step ${nextOrder}.`,
    after: {
      order: nextOrder,
      description,
      expectedResult,
      testData: testData ?? null
    }
  });

  return NextResponse.json(step);
}
