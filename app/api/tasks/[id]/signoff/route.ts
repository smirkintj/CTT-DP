import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { ActivityType, TaskHistoryAction } from '@prisma/client';
import { createActivity } from '../../../../../lib/activity';
import { sendTaskSignedOffEmail } from '../../../../../lib/email';
import { sendTeamsMessage } from '../../../../../lib/teams';
import { validateExpectedUpdatedAt } from '../../../../../lib/taskGuards';
import { createTaskHistory } from '../../../../../lib/taskHistory';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: {
        select: {
          email: true,
          name: true
        }
      }
    }
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (task.status === 'DRAFT') {
    return NextResponse.json({ error: 'Task is not ready for stakeholder actions' }, { status: 409 });
  }

  const staleMessage = validateExpectedUpdatedAt(task.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return NextResponse.json({ error: staleMessage }, { status: 409 });
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const signedOffAt = new Date();

  await prisma.task.update({
    where: { id },
    data: {
      signedOffAt,
      signedOffById: session.user.id,
      updatedById: session.user.id
    }
  });

  await createActivity({
    type: ActivityType.SIGNED_OFF,
    message: `${session.user.name || session.user.email} signed off "${task.title}".`,
    taskId: id,
    actorId: session.user.id,
    countryCode: task.countryCode
  });

  await createTaskHistory({
    taskId: id,
    actorId: session.user.id,
    action: TaskHistoryAction.SIGNED_OFF,
    message: `${session.user.name || session.user.email || 'User'} signed off the task.`,
    after: {
      signedOffAt: signedOffAt.toISOString(),
      signedOffById: session.user.id
    }
  });

  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { email: true }
  });

  if (adminUser?.email) {
    await sendTaskSignedOffEmail({
      to: adminUser.email,
      cc: task.assignee?.email ?? undefined,
      recipientName: adminUser.email,
      taskTitle: task.title,
      taskId: task.id,
      signedOffBy: session.user.name || session.user.email || 'User',
      signedOffAt
    });
  }

  void sendTeamsMessage({
    countryCode: task.countryCode,
    eventType: 'SIGNED_OFF',
    title: `Task Signed Off (${task.countryCode})`,
    text: `${session.user.name || session.user.email} signed off "${task.title}".`,
    taskId: task.id,
    facts: [
      { name: 'Task', value: task.title },
      { name: 'Country', value: task.countryCode },
      { name: 'Signed Off By', value: session.user.name || session.user.email || 'User' }
    ]
  });

  return NextResponse.json({ ok: true });
}
