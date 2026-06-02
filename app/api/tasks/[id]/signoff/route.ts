import { NextResponse } from 'next/server';
import prisma from '../../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth';
import { ActivityType, TaskHistoryAction } from '@prisma/client';
import { createActivity } from '../../../../../lib/activity';
import { sendTaskSignedOffEmail } from '../../../../../lib/email';
import { sendTeamsMessage } from '../../../../../lib/teams';
import { validateExpectedUpdatedAt } from '../../../../../lib/taskGuards';
import { isJiraConfigured, transitionJiraIssue, createJiraSubtask, attachFileToJiraIssue } from '../../../../../lib/jira';
import { generateSignoffReportHtml } from '../../../../../lib/signoffReport';
import { decryptField } from '../../../../../lib/encrypt';
import { createTaskHistory } from '../../../../../lib/taskHistory';
import { logPilotEvent } from '../../../../../lib/telemetry';

function buildSignoffAdf(params: {
  title: string;
  countryCode: string;
  productName: string;
  signerName: string;
  signedOffAt: Date;
  jiraTicket: string;
}) {
  const { title, countryCode, productName, signerName, signedOffAt, jiraTicket } = params;
  const fmt = (d: Date) => d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

  const infoLine = (label: string, value: string) => ({
    type: 'paragraph',
    content: [
      { type: 'text', text: `${label}: `, marks: [{ type: 'strong' }] },
      { type: 'text', text: value }
    ]
  });

  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'UAT Sign-off Details' }]
      },
      infoLine('Task', title),
      infoLine('Country', countryCode),
      infoLine('Product', productName),
      infoLine('Jira Ticket', jiraTicket),
      infoLine('Signed Off By', signerName),
      infoLine('Signed Off At', fmt(signedOffAt)),
      { type: 'rule' },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Full sign-off report with evidence screenshots is attached to this subtask (open the .html file in a browser to view or print as PDF).',
            marks: [{ type: 'em' }]
          }
        ]
      }
    ]
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    logPilotEvent('task.signoff.denied', { reason: 'unauthorized', taskId: id });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const MAX_SIGNATURE_BYTES = 512 * 1024; // 512 KB
  const rawSignature = body?.signatureData;
  const signatureData =
    typeof rawSignature === 'string' &&
    rawSignature.startsWith('data:image/') &&
    rawSignature.length <= MAX_SIGNATURE_BYTES
      ? rawSignature
      : null;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: {
        select: {
          email: true,
          name: true,
          notifyOnSignoffEmail: true
        }
      },
      product: { select: { name: true, jiraReadyToDeployTransition: true, jiraBaseUrl: true, jiraEmail: true, jiraToken: true } }
    }
  });

  if (!task) {
    logPilotEvent('task.signoff.denied', { reason: 'task_not_found', taskId: id, actorId: session.user.id });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (task.status === 'DRAFT') {
    return NextResponse.json({ error: 'Task is not ready for stakeholder actions' }, { status: 409 });
  }

  if (task.signedOffAt) {
    return NextResponse.json({ error: 'Task is already signed off' }, { status: 409 });
  }

  const staleMessage = validateExpectedUpdatedAt(task.updatedAt, body?.expectedUpdatedAt);
  if (staleMessage) {
    return NextResponse.json({ error: staleMessage }, { status: 409 });
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
      signatureData,
      updatedById: session.user.id
    }
  });

  if (task.jiraTicket) {
    const perProduct = task.product.jiraBaseUrl || task.product.jiraEmail || task.product.jiraToken
      ? { baseUrl: task.product.jiraBaseUrl ?? undefined, email: task.product.jiraEmail ?? undefined, token: decryptField(task.product.jiraToken) ?? undefined }
      : null;
    if (isJiraConfigured(perProduct)) {
      void transitionJiraIssue(task.jiraTicket, task.product.jiraReadyToDeployTransition || 'Ready to Deploy', perProduct);

      const jiraTicket = task.jiraTicket;
      const taskId = task.id;
      const taskTitle = task.title;
      const countryCode = task.countryCode;
      const signerName = session.user.name || session.user.email || 'User';
      void (async () => {
        try {
          const adf = buildSignoffAdf({
            title: taskTitle,
            countryCode,
            productName: task.product.name,
            signerName,
            signedOffAt,
            jiraTicket
          });
          const subtaskKey = await createJiraSubtask(
            jiraTicket,
            `Sign-off Report — ${taskTitle} [${countryCode}]`,
            adf,
            perProduct
          );
          if (subtaskKey) {
            const html = await generateSignoffReportHtml(taskId);
            const buf = Buffer.from(html, 'utf-8');
            await attachFileToJiraIssue(subtaskKey, `signoff-report-${taskId}.html`, buf, 'text/html', perProduct);
          }
        } catch (err) {
          console.error('[signoff] subtask creation failed silently:', err);
        }
      })();
    }
  }

  await createActivity({
    type: ActivityType.SIGNED_OFF,
    message: `${session.user.name || session.user.email} signed off "${task.title}".`,
    taskId: id,
    actorId: session.user.id,
    countryCode: task.countryCode
  });

  await createTaskHistory({
    taskId: id,
    actorId: session.user.id,
    action: TaskHistoryAction.SIGNED_OFF,
    message: `${session.user.name || session.user.email || 'User'} signed off the task.`,
    after: {
      signedOffAt: signedOffAt.toISOString(),
      signedOffById: session.user.id,
      signatureCaptured: Boolean(signatureData)
    }
  });

  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { email: true, notifyOnSignoffEmail: true }
  });

  const to = adminUser?.notifyOnSignoffEmail === false ? undefined : adminUser?.email;
  const cc = task.assignee?.notifyOnSignoffEmail === false ? undefined : task.assignee?.email ?? undefined;

  if (to || cc) {
    await sendTaskSignedOffEmail({
      to: to || cc || '',
      cc: to && cc ? cc : undefined,
      recipientName: adminUser?.email,
      taskTitle: task.title,
      taskId: task.id,
      signedOffBy: session.user.name || session.user.email || 'User',
      signedOffAt
    });
  }

  void sendTeamsMessage({
    countryCode: task.countryCode,
    productId: task.productId,
    eventType: 'SIGNED_OFF',
    taskId: task.id,
    taskTitle: task.title,
    productName: task.product.name,
    module: task.module,
    actorName: session.user.name || session.user.email,
    signedOffAt
  });

  logPilotEvent('task.signoff.success', {
    taskId: id,
    actorId: session.user.id,
    countryCode: task.countryCode
  });

  return NextResponse.json({ ok: true });
}
