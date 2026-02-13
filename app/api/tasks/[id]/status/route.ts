import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getAuthSession } from '../../../../../lib/auth';
import { mapUiStatusToDb } from '../../_mappers';
import { ActivityType } from '@prisma/client';
import { createActivity, toStatusLabel } from '../../../../../lib/activity';

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
  const status = body?.status as string | undefined;
  const stepOrder = typeof body?.stepOrder === 'number' ? body.stepOrder : undefined;

  if (!status) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
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

  const dbStatus = mapUiStatusToDb(status);
  const previousStatus = task.status;

  if (previousStatus === dbStatus) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await prisma.task.update({
    where: { id },
    data: {
      status: dbStatus,
      updatedById: session.user.id
    }
  });

  if (dbStatus === 'DEPLOYED' || dbStatus === 'FAILED') {
    const failedMessage =
      stepOrder && stepOrder > 0
        ? `${session.user.name || session.user.email} marked Step ${stepOrder} in ${task.title} as Failed.`
        : `${session.user.name || session.user.email} marked a step in ${task.title} as Failed.`;

    await createActivity({
      type: dbStatus === 'DEPLOYED' ? ActivityType.DEPLOYED : ActivityType.STATUS_CHANGED,
      message:
        dbStatus === 'FAILED'
          ? failedMessage
          : `${session.user.name || session.user.email} changed "${task.title}" from ${toStatusLabel(previousStatus)} to ${toStatusLabel(dbStatus)}.`,
      taskId: id,
      actorId: session.user.id,
      countryCode: task.countryCode
    });
  }

  return NextResponse.json({ ok: true });
}
