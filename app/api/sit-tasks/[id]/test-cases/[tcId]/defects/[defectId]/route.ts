// app/api/sit-tasks/[id]/test-cases/[tcId]/defects/[defectId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitHistoryAction } from '@prisma/client';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tcId: string; defectId: string }> }
) {
  const { id, tcId, defectId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const defect = await prisma.sitDefect.findUnique({
    where: { id: defectId },
    select: { jiraKey: true, sitTestCaseId: true },
  });
  if (!defect || defect.sitTestCaseId !== tcId) return notFound();

  const tc = await prisma.sitTestCase.findUnique({
    where: { id: tcId },
    select: { seqId: true, sitTaskId: true },
  });
  if (!tc || tc.sitTaskId !== id) return notFound();

  await prisma.sitDefect.delete({ where: { id: defectId } });

  await createSitHistory({
    sitTaskId: id,
    actorId: session.user.id,
    action: SitHistoryAction.DEFECT_UNLINKED,
    message: `${session.user.name ?? session.user.email} unlinked defect ${defect.jiraKey} from TC#${tc.seqId}.`,
  });

  return NextResponse.json({ ok: true });
}
