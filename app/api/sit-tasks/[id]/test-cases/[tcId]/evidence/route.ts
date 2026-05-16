// app/api/sit-tasks/[id]/test-cases/[tcId]/evidence/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitEvidenceType, SitHistoryAction } from '@prisma/client';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; tcId: string }> }
) {
  const { id, tcId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const tc = await prisma.sitTestCase.findUnique({
    where: { id: tcId },
    select: { id: true, seqId: true, sitTaskId: true },
  });
  if (!tc || tc.sitTaskId !== id) return notFound();

  const body = await req.json().catch(() => ({}));
  const { type, url, imageData, filename } = body;

  if (!type || !Object.values(SitEvidenceType).includes(type)) {
    return badRequest('Invalid evidence type (IMAGE or JAM_LINK)');
  }
  if (type === 'JAM_LINK' && !url) return badRequest('url required for JAM_LINK');
  if (type === 'IMAGE' && !imageData) return badRequest('imageData required for IMAGE');

  const evidence = await prisma.sitEvidence.create({
    data: {
      sitTestCaseId: tcId,
      type,
      url: url ?? null,
      imageData: imageData ?? null,
      filename: filename ?? null,
    },
  });

  await createSitHistory({
    sitTaskId: id,
    actorId: session.user.id,
    action: SitHistoryAction.EVIDENCE_ADDED,
    message: `${session.user.name ?? session.user.email} added ${type} evidence to TC#${tc.seqId}.`,
  });

  return NextResponse.json(evidence, { status: 201 });
}
