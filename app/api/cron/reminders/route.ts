import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { sendTaskReminderEmail } from '../../../../lib/email';

/**
 * GET /api/cron/reminders
 *
 * Triggered daily by Vercel Cron (see vercel.json).
 * Sends reminder emails to stakeholders whose tasks are due within N days.
 *
 * Security: Bearer token checked against CRON_SECRET env var.
 * Can also be triggered manually by an admin for testing.
 */
export async function GET(req: Request) {
  // --- Auth: must supply CRON_SECRET ---
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const tokenBuf = Buffer.from(token.padEnd(cronSecret.length));
  const secretBuf = Buffer.from(cronSecret);
  if (tokenBuf.length !== secretBuf.length || !timingSafeEqual(tokenBuf, secretBuf)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Load settings from PortalSetting ---
  const settingRow = await prisma.portalSetting.findUnique({
    where: { key: 'email.reminders' },
    select: { value: true }
  });

  const settings = settingRow?.value as Record<string, unknown> | null;
  const isEnabled = settings?.enabled === true;
  if (!isEnabled) {
    return NextResponse.json({ skipped: true, reason: 'reminders_disabled' });
  }

  const daysBefore =
    typeof settings?.daysBefore === 'number' && settings.daysBefore > 0
      ? settings.daysBefore
      : 3;

  // --- Find tasks due within N days ---
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysBefore);

  const tasks = await prisma.task.findMany({
    where: {
      status: { in: ['READY', 'IN_PROGRESS'] },
      dueDate: { gt: now, lte: cutoff },
      assigneeId: { not: null }
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      countryCode: true,
      assignee: {
        select: {
          id: true,
          email: true,
          name: true,
          notifyOnReminderEmail: true,
          isActive: true
        }
      }
    }
  });

  let sent = 0;
  let skipped = 0;

  for (const task of tasks) {
    const assignee = task.assignee;
    if (!assignee?.email || !assignee.isActive || !assignee.notifyOnReminderEmail) {
      skipped++;
      continue;
    }

    const daysLeft = task.dueDate
      ? Math.ceil((task.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;

    const ok = await sendTaskReminderEmail({
      to: assignee.email,
      recipientName: assignee.name ?? undefined,
      taskTitle: task.title,
      taskId: task.id,
      daysLeft,
      dueDate: task.dueDate
    });

    if (ok) {
      sent++;
      // Log reminder sent to TaskHistory
      try {
        await prisma.taskHistory.create({
          data: {
            taskId: task.id,
            actorId: assignee.id,
            action: 'TASK_UPDATED',
            message: `Automated reminder email sent to ${assignee.name || assignee.email} (${daysLeft ?? '?'} day(s) until due).`,
            metadata: { type: 'REMINDER_SENT', daysLeft }
          }
        });
      } catch {
        // Non-critical — don't fail the run
      }
    } else {
      skipped++;
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, tasksEvaluated: tasks.length });
}
