// app/api/sit-tasks/[id]/signoff/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden, notFound, badRequest } from '@/lib/apiError';
import { createSitHistory } from '@/lib/sitHistory';
import { SitCaseStatus, SitHistoryAction, SitTaskStatus } from '@prisma/client';
import { isJiraConfigured, transitionJiraIssue, createJiraSubtask, attachFileToJiraIssue } from '@/lib/jira';
import { generateSitSignoffReportHtml } from '@/lib/sitSignoffReport';
import { decryptField } from '@/lib/encrypt';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'QA') return forbidden();

  const task = await prisma.sitTask.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          name: true,
          jiraBaseUrl: true,
          jiraEmail: true,
          jiraToken: true,
          jiraSitDoneTransition: true,
        },
      },
      testCases: { select: { id: true, status: true, conditionalNote: true } },
    },
  });
  if (!task) return notFound();

  // Verify QA has product access
  const accessCheck = await prisma.userProductAccess.findFirst({
    where: { userId: session.user.id, productId: task.productId },
  });
  if (!accessCheck) return forbidden();

  if (task.status === SitTaskStatus.SIGNED_OFF) {
    return badRequest('Already signed off');
  }

  // Validate all test cases are PASS or CONDITIONAL
  const blocking = task.testCases.filter(
    (tc) => ![SitCaseStatus.PASS, SitCaseStatus.CONDITIONAL].includes(tc.status as SitCaseStatus)
  );
  if (blocking.length > 0) {
    return badRequest(
      `${blocking.length} test case(s) are not PASS or CONDITIONAL. Resolve them before signing off.`
    );
  }

  // Validate CONDITIONAL cases have notes
  const missingNote = task.testCases.filter(
    (tc) => tc.status === SitCaseStatus.CONDITIONAL && !tc.conditionalNote
  );
  if (missingNote.length > 0) {
    return badRequest('All CONDITIONAL test cases require a conditionalNote');
  }

  const body = await req.json().catch(() => ({}));
  const signatureData =
    typeof body?.signatureData === 'string' && body.signatureData.startsWith('data:image/')
      ? body.signatureData
      : null;

  const signedOffAt = new Date();

  await prisma.sitTask.update({
    where: { id },
    data: {
      status: SitTaskStatus.SIGNED_OFF,
      signedOffAt,
      signedOffById: session.user.id,
      signatureData,
      updatedById: session.user.id,
    },
  });

  await createSitHistory({
    sitTaskId: id,
    actorId: session.user.id,
    action: SitHistoryAction.SIGNED_OFF,
    message: `${session.user.name ?? session.user.email} signed off the SIT task.`,
    after: {
      signedOffAt: signedOffAt.toISOString(),
      signatureCaptured: Boolean(signatureData),
    },
  });

  // Jira fire-and-forget
  if (task.jiraTicket) {
    const perProduct = task.product.jiraBaseUrl
      ? {
          baseUrl: task.product.jiraBaseUrl ?? undefined,
          email: task.product.jiraEmail ?? undefined,
          token: decryptField(task.product.jiraToken) ?? undefined,
        }
      : null;

    if (isJiraConfigured(perProduct)) {
      void transitionJiraIssue(
        task.jiraTicket,
        task.product.jiraSitDoneTransition || 'SIT Done',
        perProduct
      );
      void (async () => {
        try {
          const subtaskKey = await createJiraSubtask(
            task.jiraTicket,
            `SIT Sign-off Report — ${task.title}`,
            {
              version: 1,
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: `SIT signed off by ${session.user.name ?? session.user.email} at ${signedOffAt.toISOString()}`,
                    },
                  ],
                },
              ],
            },
            perProduct
          );
          if (subtaskKey) {
            const html = await generateSitSignoffReportHtml(id);
            await attachFileToJiraIssue(
              subtaskKey,
              `sit-signoff-${id}.html`,
              Buffer.from(html, 'utf-8'),
              'text/html',
              perProduct
            );
          }
        } catch (err) {
          console.error('[sit-signoff] subtask creation failed:', err);
        }
      })();
    }
  }

  return NextResponse.json({ ok: true });
}
