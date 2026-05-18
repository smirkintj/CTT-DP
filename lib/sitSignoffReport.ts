// lib/sitSignoffReport.ts
import prisma from './prisma';

export async function generateSitSignoffReportHtml(
  sitTaskId: string,
  opts: { autoPrint?: boolean } = {}
): Promise<string> {
  const task = await prisma.sitTask.findUniqueOrThrow({
    where: { id: sitTaskId },
    include: {
      product: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
      signedOffBy: { select: { name: true, email: true } },
      countries: { select: { countryCode: true } },
      testCases: {
        orderBy: { seqId: 'asc' },
        include: {
          evidence: true,
          defects: true,
          countryResults: { orderBy: { countryCode: 'asc' } },
        },
      },
    },
  });

  const fmt = (d: Date | string | null) =>
    d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      PASS: '#16a34a',
      CONDITIONAL: '#d97706',
      FAIL: '#dc2626',
      BLOCKED: '#7c3aed',
      NOT_STARTED: '#6b7280',
    };
    return `<span style="color:${colors[s] ?? '#000'};font-weight:600">${s}</span>`;
  };

  const countries = task.countries.map((c) => c.countryCode).join(', ');

  const testCaseRows = task.testCases
    .map((tc) => {
      const defectLinks = tc.defects
        .map((d) => `<a href="${d.url ?? '#'}">${d.jiraKey}</a>`)
        .join(', ');

      const evidenceLinks = tc.evidence
        .map((e) =>
          e.type === 'JAM_LINK'
            ? `<a href="${e.url}">🎬 Recording</a>`
            : `<span>📷 ${e.filename ?? 'Image'}</span>`
        )
        .join(' · ');

      const countryRows = tc.splitByCountry
        ? tc.countryResults
            .map(
              (cr) =>
                `<tr style="background:#fafafa"><td style="padding-left:24px">${cr.countryCode}</td><td></td><td></td><td>${statusBadge(cr.status)}</td><td>${cr.actualResult ?? ''}</td><td>${cr.testerName ?? ''}</td><td>${fmt(cr.testedAt)}</td><td></td><td></td></tr>`
            )
            .join('')
        : '';

      return `
        <tr>
          <td>${tc.seqId}</td>
          <td>${tc.name}</td>
          <td>${tc.category ?? ''}</td>
          <td>${statusBadge(tc.status)}</td>
          <td>${tc.actualResult ?? ''}</td>
          <td>${tc.testerName ?? ''}</td>
          <td>${fmt(tc.testedAt)}</td>
          <td>${defectLinks}</td>
          <td>${evidenceLinks}</td>
        </tr>
        ${countryRows}
        ${tc.conditionalNote ? `<tr><td colspan="9" style="background:#fffbeb;padding:4px 8px;font-size:11px;color:#92400e">⚠ Conditional: ${tc.conditionalNote}</td></tr>` : ''}
      `;
    })
    .join('');

  const autoPrintScript = opts.autoPrint
    ? `<script>window.addEventListener('load', () => window.print());</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>SIT Sign-off Report — ${task.title}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; margin: 32px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 16px 0; background: #f8fafc; padding: 12px; border-radius: 8px; }
    .meta span { color: #64748b; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
    th { background: #1e293b; color: white; padding: 8px; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    .sig { margin-top: 32px; }
    .sig img { border: 1px solid #e2e8f0; border-radius: 4px; max-height: 80px; }
    @media print { body { margin: 0; } }
  </style>
  ${autoPrintScript}
</head>
<body>
  <h1>SIT Sign-off Report</h1>
  <div class="meta">
    <div><span>Jira Ticket</span><br/><strong>${task.jiraTicket}</strong></div>
    <div><span>Sprint</span><br/><strong>${task.sprintName}</strong></div>
    <div><span>Product</span><br/><strong>${task.product.name}</strong></div>
    <div><span>Module</span><br/><strong>${task.module ?? '—'}</strong></div>
    <div><span>Environment</span><br/><strong>${task.environment ?? '—'}</strong></div>
    <div><span>Countries</span><br/><strong>${countries}</strong></div>
    <div><span>Signed Off By</span><br/><strong>${task.signedOffBy?.name ?? task.signedOffBy?.email ?? '—'}</strong></div>
    <div><span>Signed Off At</span><br/><strong>${fmt(task.signedOffAt)}</strong></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Test Case</th><th>Category</th><th>Status</th>
        <th>Actual Result</th><th>Tester</th><th>Date</th><th>Defects</th><th>Evidence</th>
      </tr>
    </thead>
    <tbody>${testCaseRows}</tbody>
  </table>

  ${task.signatureData ? `<div class="sig"><p><strong>Signature:</strong></p><img src="${task.signatureData}" alt="Signature"/></div>` : ''}
</body>
</html>`;
}
