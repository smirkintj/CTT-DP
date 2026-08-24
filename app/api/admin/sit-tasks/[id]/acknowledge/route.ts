// app/api/admin/sit-tasks/[id]/acknowledge/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { createAdminAudit } from '@/lib/adminAudit';
import { SitHistoryAction } from '@prisma/client';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'ADMIN') return forbidden();

  const body = await req.json().catch(() => ({}));
  const { testCaseId, note } = body;
  if (!testCaseId) return badRequest('testCaseId required');

  const tc = await prisma.sitTestCase.findUnique({
    where: { id: testCaseId },
    select: { seqId: true, sitTaskId: true, status: true },
  });
  if (!tc || tc.sitTaskId !== id) return notFound();
  if (tc.status !== 'CONDITIONAL') return badRequest('Test case is not CONDITIONAL');

  await prisma.sitTestCase.update({
    where: { id: testCaseId },
    data: {
      adminAcknowledgedAt: new Date(),
      adminAcknowledgedById: session.user.id,
    },
  });

  await createSitHistory({
    sitTaskId: id,
    actorId: session.user.id,
    action: SitHistoryAction.CONDITIONAL_ACKNOWLEDGED,
    message: `${session.user.name ?? session.user.email} acknowledged CONDITIONAL TC#${tc.seqId}${note ? `: ${note}` : ''}.`,
    after: { testCaseId, note: note ?? null },
  });

  await createAdminAudit({
    actorId: session.user.id,
    message: `${session.user.name || session.user.email || 'Admin'} acknowledged CONDITIONAL TC#${tc.seqId} on SIT task ${id}.`,
    metadata: { sitTaskId: id, testCaseId, seqId: tc.seqId, note: note ?? null }
  });

  return NextResponse.json({ ok: true });
}
