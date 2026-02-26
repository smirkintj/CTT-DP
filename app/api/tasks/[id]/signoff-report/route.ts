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

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CTT Sign-off Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 24px; }
    .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 22px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 16px 0; font-size: 13px; }
    .label { color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 14px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    .footer { margin-top: 18px; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>CTT UAT Sign-off Report</h1>
    <div class="footer">Generated on ${formatDateTime(new Date())}</div>
  </div>
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
  <div class="footer">This report is generated from CTT UAT Portal task data.</div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
