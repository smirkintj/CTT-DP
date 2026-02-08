import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getAuthSession } from '../../../../../lib/auth';
import { mapUiStatusToDb } from '../../_mappers';

interface Params {
  params: { id: string };
}

export async function POST(req: Request, { params }: Params) {
  const session = await getAuthSession();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const status = body?.status as string | undefined;

  if (!status) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const task = await prisma.task.findUnique({
    where: { id: params.id }
  });

  if (!task) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin && task.assigneeId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dbStatus = mapUiStatusToDb(status);

  await prisma.task.update({
    where: { id: params.id },
    data: {
      status: dbStatus
    }
  });

  return NextResponse.json({ ok: true });
}
