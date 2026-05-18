// app/api/sit-tasks/[id]/test-cases/[tcId]/evidence/[evidenceId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound } from '@/lib/apiError';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tcId: string; evidenceId: string }> }
) {
  const { id, tcId, evidenceId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const evidence = await prisma.sitEvidence.findUnique({
    where: { id: evidenceId },
    select: { sitTestCaseId: true },
  });
  if (!evidence || evidence.sitTestCaseId !== tcId) return notFound();

  // Verify tcId belongs to this task
  const tc = await prisma.sitTestCase.findUnique({
    where: { id: tcId },
    select: { sitTaskId: true },
  });
  if (!tc || tc.sitTaskId !== id) return notFound();

  await prisma.sitEvidence.delete({ where: { id: evidenceId } });
  return NextResponse.json({ ok: true });
}
