import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { sendTaskAssignedEmail } from '../../../../../lib/email';
import { sendTeamsMessage } from '../../../../../lib/teams';
import { createAdminAudit } from '../../../../../lib/adminAudit';

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

  if (!task.assignee?.email) {
    return NextResponse.json({ error: 'Task assignee email is missing' }, { status: 400 });
  }

  const sent = await sendTaskAssignedEmail({
    to: task.assignee.email,
    assigneeName: task.assignee.name ?? undefined,
    taskTitle: task.title,
    taskId: task.id,
    countryCode: task.countryCode,
    dueDate: task.dueDate
  });

  if (!sent) {
    await createAdminAudit({
      actorId: session.user.id,
      countryCode: task.countryCode,
      message: `Admin failed assignment email trigger for "${task.title}".`,
      metadata: { action: 'TASK_ASSIGNMENT_EMAIL_FAILED', taskId: task.id }
    });
    return NextResponse.json({ error: 'Failed to send assignment email' }, { status: 500 });
  }

  await createAdminAudit({
    actorId: session.user.id,
    countryCode: task.countryCode,
    message: `Admin triggered assignment email for "${task.title}".`,
    metadata: {
      action: 'TASK_ASSIGNMENT_EMAIL_TRIGGERED',
      taskId: task.id,
      assigneeEmail: task.assignee.email
    }
  });

  void sendTeamsMessage({
    countryCode: task.countryCode,
    eventType: 'TASK_ASSIGNED',
    title: `Task Assignment (${task.countryCode})`,
    text: `Assignment notification sent for "${task.title}".`,
    taskId: task.id,
    facts: [
      { name: 'Task', value: task.title },
      { name: 'Assignee', value: task.assignee.name || task.assignee.email || 'User' }
    ]
  });

  return NextResponse.json({ success: true });
}
