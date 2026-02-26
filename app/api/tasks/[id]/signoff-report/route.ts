import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { forbidden, notFound, unauthorized } from '@/lib/apiError';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDateTime(value?: Date | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { name: true, email: true } },
      signedOffBy: { select: { name: true, email: true } },
      country: { select: { code: true, name: true } },
      steps: { orderBy: { order: 'asc' } }
    }
  });

  if (!task) return notFound('Task not found', 'TASK_NOT_FOUND');

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return forbidden('Forbidden', 'TASK_FORBIDDEN');
    }
  }

  const history = await prisma.taskHistory.findMany({
    where: { taskId: id },
    include: {
      actor: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  const stepsRows = task.steps
    .map(
      (step) => `
      <tr>
        <td>${step.order}</td>
        <td>${escapeHtml(step.description)}</td>
        <td>${escapeHtml(step.expectedResult)}</td>
        <td>${escapeHtml(step.actualResult || '—')}</td>
        <td>${step.isPassed === true ? 'Passed' : step.isPassed === false ? 'Failed' : 'Not completed'}</td>
      </tr>`
    )
    .join('');

  const historyRows =
    history.length === 0
      ? `<tr><td colspan="3" class="muted">No task history found.</td></tr>`
      : history
          .map(
            (entry) => `
      <tr>
        <td>${formatDateTime(entry.createdAt)}</td>
        <td>${escapeHtml(entry.actor?.name || entry.actor?.email || 'System')}</td>
        <td>${escapeHtml(entry.message)}</td>
      </tr>`
          )
          .join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CTT Sign-off Report</title>
  <style>
    @page { size: A4 portrait; margin: 14mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }
    .page { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; }
    .header { border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 20px; }
    .subtitle { margin-top: 4px; color: #64748b; font-size: 12px; }
    .section-title { margin: 18px 0 8px; font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 10px 0 16px; font-size: 13px; }
    .label { color: #64748b; margin-right: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    .muted { color: #64748b; text-align: center; }
    .footer { margin-top: 14px; color: #64748b; font-size: 11px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>CTT UAT Sign-off Report</h1>
      <div class="subtitle">Generated on ${formatDateTime(new Date())}</div>
    </div>
    <div class="section-title">Task Summary</div>
    <div class="meta">
      <div><span class="label">Task:</span> ${escapeHtml(task.title)}</div>
      <div><span class="label">Country:</span> ${escapeHtml(task.country.code)} - ${escapeHtml(task.country.name)}</div>
      <div><span class="label">Module:</span> ${escapeHtml(task.module)}</div>
      <div><span class="label">Priority:</span> ${escapeHtml(task.priority)}</div>
      <div><span class="label">Assignee:</span> ${escapeHtml(task.assignee?.name || task.assignee?.email || '—')}</div>
      <div><span class="label">Due Date:</span> ${formatDateTime(task.dueDate)}</div>
      <div><span class="label">Signed Off By:</span> ${escapeHtml(task.signedOffBy?.name || task.signedOffBy?.email || '—')}</div>
      <div><span class="label">Signed Off At:</span> ${formatDateTime(task.signedOffAt)}</div>
      <div><span class="label">Jira Ticket:</span> ${escapeHtml(task.jiraTicket || '—')}</div>
      <div><span class="label">CR Number:</span> ${escapeHtml(task.crNumber || '—')}</div>
    </div>
    <div class="section-title">Test Steps</div>
    <table>
      <thead>
        <tr>
          <th style="width:48px;">Step</th>
          <th>Description</th>
          <th>Expected Result</th>
          <th>Actual Result</th>
          <th style="width:110px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${stepsRows}
      </tbody>
    </table>
    <div class="section-title">Task History (Latest 20)</div>
    <table>
      <thead>
        <tr>
          <th style="width:170px;">When</th>
          <th style="width:160px;">By</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${historyRows}
      </tbody>
    </table>
    <div class="footer">This report is generated from CTT UAT Portal task data.</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
