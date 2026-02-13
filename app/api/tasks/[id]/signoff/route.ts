import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { ActivityType } from '@prisma/client';
import { createActivity } from '../../../../../lib/activity';

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

  return NextResponse.json({ ok: true });
}
