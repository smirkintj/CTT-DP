import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { sendTaskReminderEmail } from '../../../../../lib/email';
import { sendTeamsMessage } from '../../../../../lib/teams';

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

  const now = Date.now();
  const due = task.dueDate ? new Date(task.dueDate).getTime() : Number.NaN;
  const daysLeft =
    Number.isNaN(due) || due <= now
      ? 0
      : Math.ceil((due - now) / (24 * 60 * 60 * 1000));

  const sent = await sendTaskReminderEmail({
    to: task.assignee.email,
    recipientName: task.assignee.name ?? undefined,
    taskTitle: task.title,
    taskId: task.id,
    daysLeft,
    dueDate: task.dueDate
  });

  if (!sent) {
    return NextResponse.json({ error: 'Failed to send reminder email' }, { status: 500 });
  }

  void sendTeamsMessage({
    countryCode: task.countryCode,
    eventType: 'REMINDER',
    title: `UAT Reminder (${task.countryCode})`,
    text: `Reminder sent for "${task.title}" to ${task.assignee.name || task.assignee.email}.`,
    taskId: task.id,
    facts: [
      { name: 'Task', value: task.title },
      { name: 'Assignee', value: task.assignee.name || task.assignee.email || 'User' },
      { name: 'Due Date', value: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'N/A' }
    ]
  });

  return NextResponse.json({ success: true });
}
