import { NextResponse } from 'next/server';
import prisma from '../../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../../lib/auth';
import { validateExpectedUpdatedAt } from '../../../../../../lib/taskGuards';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await params;
  if (!id || !stepId) {
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

  if (task.signedOffAt) {
    return NextResponse.json({ error: 'Task is signed off and locked' }, { status: 409 });
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const stepRecord = await prisma.taskStep.findUnique({
    where: { id: stepId }
  });

  if (!stepRecord || stepRecord.taskId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const staleMessage = validateExpectedUpdatedAt(task.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return NextResponse.json({ error: staleMessage }, { status: 409 });
  }

  const data = isAdmin
    ? {
        description: body?.description ?? undefined,
        expectedResult: body?.expectedResult ?? undefined,
        testData: body?.testData ?? undefined
      }
    : {
        isPassed: body?.isPassed ?? undefined,
        actualResult: body?.actualResult ?? undefined,
        attachments: body?.attachments ?? undefined
      };

  const step = await prisma.taskStep.update({
    where: { id: stepId },
    data
  });

  await prisma.task.update({
    where: { id },
    data: {
      updatedById: session.user.id
    }
  });

  return NextResponse.json(step);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const { id, stepId } = await params;
  if (!id || !stepId) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const stepRecord = await prisma.taskStep.findUnique({
    where: { id: stepId }
  });

  if (!stepRecord || stepRecord.taskId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const task = await prisma.task.findUnique({
    where: { id },
    select: { signedOffAt: true, updatedAt: true }
  });
  if (task?.signedOffAt) {
    return NextResponse.json({ error: 'Task is signed off and locked' }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const staleMessage = validateExpectedUpdatedAt(task.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return NextResponse.json({ error: staleMessage }, { status: 409 });
  }

  await prisma.taskStep.delete({
    where: { id: stepId }
  });

  const remainingSteps = await prisma.taskStep.findMany({
    where: { taskId: id },
    orderBy: { order: 'asc' }
  });

  await prisma.$transaction(
    remainingSteps.map((step, index) =>
      prisma.taskStep.update({
        where: { id: step.id },
        data: { order: index + 1 }
      })
    )
  );

  await prisma.task.update({
    where: { id },
    data: {
      updatedById: session.user.id
    }
  });

  return NextResponse.json({ ok: true });
}
