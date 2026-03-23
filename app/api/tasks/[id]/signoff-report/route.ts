import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { forbidden, notFound, unauthorized } from '@/lib/apiError';
import { adminCanAccessProduct } from '@/lib/adminAccess';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function preserveNewlines(value: string) {
  return escapeHtml(value).replaceAll('\n', '<br />');
}

function formatDateTime(value?: Date | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function extractAttachmentImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string' && item.startsWith('data:image/')).slice(0, 8);
}

function buildSignatureFooter(task: {
  signatureData?: string | null;
  signedOffAt?: Date | null;
  signedOffBy?: { name: string | null; email: string | null } | null;
}) {
  if (!task.signatureData) return '';
  const signer = escapeHtml(task.signedOffBy?.name || task.signedOffBy?.email || 'User');
  return `
    <div class="signature-footer">
      <div class="signature-footer__meta">
        <div class="signature-footer__label">Signed electronically by ${signer}</div>
        <div class="signature-footer__date">${escapeHtml(formatDateTime(task.signedOffAt))}</div>
      </div>
      <img src="${task.signatureData}" alt="User signature" class="signature-footer__image" />
    </div>
  `;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const autoPrint = new URL(_req.url).searchParams.get('autoprint') === '1';
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');

  const { id } = await params;
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { name: true, email: true } },
      signedOffBy: { select: { name: true, email: true } },
      country: { select: { code: true, name: true } },
      product: { select: { name: true } },
      steps: { orderBy: { order: 'asc' } },
      comments: {
        include: {
          author: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
        take: 200
      }
    }
  });

  if (!task) return notFound('Task not found', 'TASK_NOT_FOUND');

  const isAdmin = session.user.role === 'ADMIN';
  if (!isAdmin) {
    if (task.assigneeId !== session.user.id || task.countryCode !== session.user.countryCode) {
      return forbidden('Forbidden', 'TASK_FORBIDDEN');
    }
  } else if (!(await adminCanAccessProduct(session.user.id, task.productId))) {
    return forbidden('Forbidden', 'ADMIN_PRODUCT_FORBIDDEN');
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
      (step) => {
        const attachmentImages = extractAttachmentImages(step.attachments as unknown);
        const evidenceCell =
          attachmentImages.length === 0
            ? '—'
            : `<div class="evidence-grid">${attachmentImages
                .map(
                  (src, index) =>
                    `<img src="${src}" alt="Step ${step.order} evidence ${index + 1}" class="evidence-image" />`
                )
                .join('')}</div>`;
        return `
      <tr>
        <td>${step.order}</td>
        <td>${escapeHtml(step.description)}</td>
        <td>${escapeHtml(step.expectedResult)}</td>
        <td>${escapeHtml(step.actualResult || '—')}</td>
        <td>${
          step.stepResult === 'PASSED'
            ? 'Passed'
            : step.stepResult === 'FAILED'
              ? 'Failed'
              : step.stepResult === 'CONDITIONAL'
                ? 'Conditional Pass'
                : step.isPassed === true
                  ? 'Passed'
                  : step.isPassed === false
                    ? 'Failed'
                    : 'Not completed'
        }</td>
      </tr>
      <tr>
        <td></td>
        <td colspan="4">
          ${step.conditionalReason ? `<div><span class="label">Conditional Reason:</span> ${escapeHtml(step.conditionalReason)}</div>` : ''}
          <div><span class="label">Evidence:</span> ${evidenceCell}</div>
        </td>
      </tr>`;
      }
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

  const groupedComments = new Map<string, typeof task.comments>();
  for (const comment of task.comments) {
    const key = comment.stepOrder ? `Step ${comment.stepOrder}` : 'General';
    const existing = groupedComments.get(key) || [];
    existing.push(comment);
    groupedComments.set(key, existing);
  }
  const commentRows =
    task.comments.length === 0
      ? ''
      : Array.from(groupedComments.entries())
          .map(([group, comments]) => {
            const rows = comments
              .map(
                (comment) => `
      <tr>
        <td style="width:170px;">${formatDateTime(comment.createdAt)}</td>
        <td style="width:150px;">${escapeHtml(comment.author.name || comment.author.email || 'User')}</td>
        <td class="comment-cell">${preserveNewlines(comment.body || '')}</td>
      </tr>`
              )
              .join('');
            return `
      <tr class="section-row"><td colspan="3">${group}</td></tr>
      ${rows}`;
          })
          .join('');

  const commentsSection =
    task.comments.length === 0
      ? ''
      : `
    <div class="section-title">Comments</div>
    <table>
      <thead>
        <tr>
          <th style="width:170px;">When</th>
          <th style="width:150px;">By</th>
          <th>Comment</th>
        </tr>
      </thead>
      <tbody>
        ${commentRows}
      </tbody>
    </table>`;

  const signatureFooter = buildSignatureFooter(task);

  // Inline SVG — no external file dependency, always renders in print/PDF
  const dkshLogoHtml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 80" class="brand-mark" aria-label="DKSH" role="img">
    <!-- Red circle badge -->
    <circle cx="40" cy="40" r="38" fill="#C8102E"/>
    <!-- Stylised white palm fronds -->
    <g fill="#ffffff">
      <!-- centre trunk base -->
      <ellipse cx="40" cy="62" rx="3.5" ry="5" />
      <!-- frond 1 — far left -->
      <path d="M40 58 Q18 44 14 26 Q24 36 40 52Z"/>
      <!-- frond 2 — left -->
      <path d="M40 56 Q24 38 22 18 Q32 30 40 50Z"/>
      <!-- frond 3 — centre-left -->
      <path d="M40 54 Q32 32 34 12 Q40 26 42 50Z"/>
      <!-- frond 4 — centre-right -->
      <path d="M40 54 Q50 32 50 12 Q44 28 38 50Z"/>
      <!-- frond 5 — right -->
      <path d="M40 56 Q58 36 62 18 Q50 30 40 50Z"/>
    </g>
    <!-- DKSH wordmark -->
    <text x="90" y="52" font-family="Arial,Helvetica,sans-serif" font-size="36" font-weight="900" fill="#C8102E" letter-spacing="1">DKSH</text>
  </svg>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CTT Sign-off Report</title>
  <style>
    @page { size: A4 portrait; margin: 16mm 14mm 28mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }
    .page { max-width: 760px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px 20px 96px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
    .header-copy { max-width: 70%; }
    .brand-lockup { width: 132px; display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
    .brand-mark { width: 140px; height: auto; display:block; }
    h1 { margin: 0; font-size: 20px; }
    .subtitle { margin-top: 4px; color: #64748b; font-size: 12px; }
    .section-title { margin: 18px 0 8px; font-size: 13px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.04em; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 10px 0 16px; font-size: 13px; }
    .label { color: #64748b; margin-right: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; text-align: left; }
    th { background: #f8fafc; font-weight: 600; }
    .muted { color: #64748b; text-align: center; }
    .comment-cell { max-width: 430px; white-space: normal; word-break: break-word; line-height: 1.45; }
    .evidence-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-top: 6px; }
    .evidence-image { width: 100%; max-height: 120px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 6px; background: #fff; }
    .section-row td { background: #f8fafc; font-weight: 600; color: #334155; }
    .footer { margin-top: 14px; color: #64748b; font-size: 11px; }
    .iso-banner { margin: 16px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 11px; }
    .iso-banner__header { background: #f1f5f9; padding: 7px 12px; display: flex; align-items: center; gap: 6px; font-weight: 700; color: #334155; letter-spacing: 0.03em; text-transform: uppercase; font-size: 10.5px; }
    .iso-banner__body { padding: 8px 12px; }
    .iso-banner__body ol { margin: 0; padding-left: 16px; color: #475569; line-height: 1.6; }
    .iso-banner__body li { margin-bottom: 2px; }
    .signature-footer { position: fixed; left: 14mm; right: 14mm; bottom: 8mm; display:flex; justify-content:space-between; align-items:flex-end; gap:16px; border-top:1px solid #e2e8f0; padding-top:8px; background:#fff; }
    .signature-footer__meta { font-size: 11px; color: #64748b; }
    .signature-footer__label { font-weight: 600; color: #334155; margin-bottom: 2px; }
    .signature-footer__image { max-height: 48px; max-width: 180px; object-fit: contain; }
  </style>
  ${autoPrint ? '<script>window.addEventListener("load",()=>window.print());</script>' : ''}
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-copy">
        <h1>CTT UAT Sign-off Report</h1>
        <div class="subtitle">Generated on ${formatDateTime(new Date())}</div>
      </div>
      <div class="brand-lockup">
        ${dkshLogoHtml}
      </div>
    </div>
    <div class="iso-banner">
      <div class="iso-banner__header">&#x1F6E1;&#xFE0F; ISO 27001:2013 Compliance Notice</div>
      <div class="iso-banner__body">
        <ol>
          <li>Only authorized users should access or modify data needed for development or enhancement.</li>
          <li>Production data should not be tampered without proper authorization and business justification. Production data should not be improperly modified, either accidentally or maliciously.</li>
          <li>Only authorized users should access data whenever they need to do so with proper approvals and audit trail.</li>
          <li>Production data copied into staging environment is only meant for testing purposes. The data should NOT be migrated back to production and staging data should be protected with the same mechanism as production.</li>
          <li>Data held in staging or test environment are only for testing purposes and should not be used for any other purposes.</li>
          <li>During migration to production, any system downtime should be planned and communicated to affected users. If possible, it should not affect business use of the system.</li>
        </ol>
      </div>
    </div>
    <div class="section-title">Task Summary</div>
    <div class="meta">
      <div><span class="label">Task:</span> ${escapeHtml(task.title)}</div>
      <div><span class="label">Country:</span> ${escapeHtml(task.country.code)} - ${escapeHtml(task.country.name)}</div>
      <div><span class="label">Product:</span> ${escapeHtml(task.product.name)}</div>
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
    ${commentsSection}
    <div class="footer">This report is generated from CTT UAT Portal task data.</div>
    ${signatureFooter}
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
