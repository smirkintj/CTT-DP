// app/api/sit-tasks/[id]/test-cases/[tcId]/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitCaseStatus, SitHistoryAction, SitTaskStatus } from '@prisma/client';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; tcId: string }> }
) {
  const { id, tcId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const tc = await prisma.sitTestCase.findUnique({
    where: { id: tcId },
    include: { sitTask: { select: { status: true, productId: true } } },
  });
  if (!tc || tc.sitTaskId !== id) return notFound();
  if (tc.sitTask.status === 'SIGNED_OFF') return badRequest('Cannot modify signed-off task');

  const body = await req.json().catch(() => ({}));
  const {
    status,
    actualResult,
    conditionalNote,
    name,
    priority,
    category,
    description,
    steps,
    expectedResult,
    testData,
    splitByCountry,
    countryResults,
  } = body;

  // Validate CONDITIONAL requires note
  if (status === SitCaseStatus.CONDITIONAL && !conditionalNote) {
    return badRequest('conditionalNote is required when status is CONDITIONAL');
  }

  const isResultChange = status && status !== tc.status;
  const isFieldChange =
    name ||
    priority !== undefined ||
    category !== undefined ||
    description !== undefined ||
    steps !== undefined ||
    expectedResult !== undefined ||
    testData !== undefined;

  const updateData: Record<string, unknown> = {};
  if (name) updateData.name = name;
  if (priority !== undefined) updateData.priority = priority;
  if (category !== undefined) updateData.category = category;
  if (description !== undefined) updateData.description = description;
  if (steps !== undefined) updateData.steps = steps;
  if (expectedResult !== undefined) updateData.expectedResult = expectedResult;
  if (testData !== undefined) updateData.testData = testData;
  if (splitByCountry !== undefined) updateData.splitByCountry = splitByCountry;
  if (status) {
    updateData.status = status;
    updateData.actualResult = actualResult ?? tc.actualResult;
    updateData.conditionalNote = conditionalNote ?? null;
    if (
      [
        SitCaseStatus.PASS,
        SitCaseStatus.FAIL,
        SitCaseStatus.CONDITIONAL,
        SitCaseStatus.BLOCKED,
      ].includes(status)
    ) {
      updateData.testerName = session.user.name ?? session.user.email;
      updateData.testedAt = new Date();
    }
  }

  const updated = await prisma.sitTestCase.update({
    where: { id: tcId },
    data: updateData,
    include: { evidence: true, defects: true, countryResults: true },
  });

  // Update per-country results if provided
  if (Array.isArray(countryResults)) {
    for (const cr of countryResults) {
      await prisma.sitTestCaseCountryResult.upsert({
        where: {
          sitTestCaseId_countryCode: {
            sitTestCaseId: tcId,
            countryCode: cr.countryCode,
          },
        },
        create: {
          sitTestCaseId: tcId,
          countryCode: cr.countryCode,
          status: cr.status,
          actualResult: cr.actualResult ?? null,
          testerName: session.user.name ?? session.user.email,
          testedAt: new Date(),
        },
        update: {
          status: cr.status,
          actualResult: cr.actualResult ?? null,
          testerName: session.user.name ?? session.user.email,
          testedAt: new Date(),
        },
      });
    }
  }

  // Auto-transition task to IN_PROGRESS on first result recorded from READY
  if (isResultChange && tc.sitTask.status === SitTaskStatus.READY) {
    await prisma.sitTask.update({
      where: { id },
      data: { status: SitTaskStatus.IN_PROGRESS, updatedById: session.user.id },
    });
  }

  if (isResultChange) {
    await createSitHistory({
      sitTaskId: id,
      actorId: session.user.id,
      action: SitHistoryAction.TEST_CASE_RESULT_RECORDED,
      message: `${session.user.name ?? session.user.email} marked TC#${tc.seqId} as ${status}.`,
      before: { status: tc.status },
      after: { status, conditionalNote: conditionalNote ?? null },
    });
  } else if (isFieldChange) {
    await createSitHistory({
      sitTaskId: id,
      actorId: session.user.id,
      action: SitHistoryAction.TEST_CASE_MODIFIED,
      message: `${session.user.name ?? session.user.email} modified TC#${tc.seqId} "${tc.name}".`,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; tcId: string }> }
) {
  const { id, tcId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const tc = await prisma.sitTestCase.findUnique({
    where: { id: tcId },
    select: {
      seqId: true,
      name: true,
      sitTaskId: true,
      sitTask: { select: { status: true } },
    },
  });
  if (!tc || tc.sitTaskId !== id) return notFound();
  if (tc.sitTask.status === 'SIGNED_OFF') return badRequest('Cannot modify signed-off task');

  await prisma.sitTestCase.delete({ where: { id: tcId } });

  await createSitHistory({
    sitTaskId: id,
    actorId: session.user.id,
    action: SitHistoryAction.TEST_CASE_REMOVED,
    message: `${session.user.name ?? session.user.email} removed TC#${tc.seqId} "${tc.name}".`,
  });

  return NextResponse.json({ ok: true });
}
