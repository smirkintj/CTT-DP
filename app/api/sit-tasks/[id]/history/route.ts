// app/api/sit-tasks/[id]/history/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA' && session.user.role !== 'ADMIN') return forbidden();

  // QA must have product access to view history
  if (session.user.role === 'QA') {
    const task = await prisma.sitTask.findUnique({ where: { id }, select: { productId: true } });
    if (!task) return notFound();
    const access = await prisma.userProductAccess.findFirst({
      where: { userId: session.user.id, productId: task.productId },
    });
    if (!access) return forbidden();
  }

  const history = await prisma.sitTaskHistory.findMany({
    where: { sitTaskId: id },
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { name: true, email: true } } },
  });

  return NextResponse.json(
    history.map((h) => ({
      id: h.id,
      action: h.action,
      message: h.message,
      before: h.before,
      after: h.after,
      actorName: h.actor?.name ?? h.actor?.email ?? 'Unknown',
      createdAt: h.createdAt.toISOString(),
    }))
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const task = await prisma.sitTask.findUnique({ where: { id }, select: { id: true } });
  if (!task) return notFound();

  const body = await req.json().catch(() => ({}));
  const { note } = body;
  if (!note?.trim()) return NextResponse.json({ error: 'note required' }, { status: 400 });

  await createSitHistory({
    sitTaskId: id,
    actorId: session.user.id,
    action: SitHistoryAction.SCOPE_NOTE_ADDED,
    message: `${session.user.name ?? session.user.email}: ${note.trim()}`,
  });

  return NextResponse.json({ ok: true });
}
