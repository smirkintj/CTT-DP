// app/api/sit-tasks/[id]/test-cases/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const task = await prisma.sitTask.findUnique({
    where: { id },
    select: { id: true, productId: true, status: true },
  });
  if (!task) return notFound();
  if (task.status === 'SIGNED_OFF') return badRequest('Cannot modify signed-off task');

  const access = await prisma.userProductAccess.findFirst({
    where: { userId: session.user.id, productId: task.productId },
  });
  if (!access) return forbidden();

  const body = await req.json().catch(() => ({}));
  const { name, priority, category, description, steps, expectedResult, testData } = body;
  if (!name) return badRequest('name is required');

  // Auto-increment seqId
  const maxSeq = await prisma.sitTestCase.aggregate({
    where: { sitTaskId: id },
    _max: { seqId: true },
  });
  const seqId = (maxSeq._max.seqId ?? 0) + 1;

  const tc = await prisma.sitTestCase.create({
    data: {
      sitTaskId: id,
      seqId,
      name,
      priority: priority ?? null,
      category: category ?? null,
      description: description ?? null,
      steps: steps ?? null,
      expectedResult: expectedResult ?? null,
      testData: testData ?? null,
    },
    include: { evidence: true, defects: true, countryResults: true },
  });

  await createSitHistory({
    sitTaskId: id,
    actorId: session.user.id,
    action: SitHistoryAction.TEST_CASE_ADDED,
    message: `${session.user.name ?? session.user.email} added TC#${seqId} "${name}".`,
    after: { seqId, name, priority, category },
  });

  await prisma.sitTask.update({
    where: { id },
    data: { updatedById: session.user.id },
  });

  return NextResponse.json(tc, { status: 201 });
}
