import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { searchJiraIssuesWithKeywordComment, fetchJiraAttachment } from '../../../../lib/jira';
import { parseExcel } from '../../../../lib/parseExcel';
import { generateDraftTask } from '../../../../lib/generateDraftTask';
import { sendDraftTaskReadyEmail } from '../../../../lib/email';

const SIT_COMPLETE_KEYWORD = process.env.SIT_COMPLETE_KEYWORD || 'SIT completed';
const POLL_WINDOW_HOURS = 2;

export async function GET(req: Request) {
  // Auth: CRON_SECRET or admin session
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results: Array<{ jiraTicket: string; status: string; reason?: string }> = [];

  // Load all active products with Jira configured
  const products = await prisma.product.findMany({
    where: { isActive: true, jiraProjectKey: { not: null } },
    select: { id: true, name: true, jiraProjectKey: true, jiraBaseUrl: true, jiraEmail: true, jiraToken: true }
  });

  for (const product of products) {
    if (!product.jiraProjectKey) continue;

    const perProduct = {
      baseUrl: product.jiraBaseUrl ?? undefined,
      email: product.jiraEmail ?? undefined,
      token: product.jiraToken ?? undefined,
    };

    const issues = await searchJiraIssuesWithKeywordComment(
      product.jiraProjectKey,
      SIT_COMPLETE_KEYWORD,
      POLL_WINDOW_HOURS,
      perProduct
    );

    for (const issue of issues) {
      // Skip if already processed
      const existing = await prisma.draftTask.findUnique({ where: { jiraTicket: issue.key } });
      if (existing) {
        results.push({ jiraTicket: issue.key, status: 'skipped', reason: 'already_processed' });
        continue;
      }

      // Need at least one Excel attachment
      if (issue.attachments.length === 0) {
        results.push({ jiraTicket: issue.key, status: 'skipped', reason: 'no_excel_attachment' });
        continue;
      }

      const attachment = issue.attachments[0];
      const buffer = await fetchJiraAttachment(attachment.content, perProduct);
      if (!buffer) {
        results.push({ jiraTicket: issue.key, status: 'error', reason: 'attachment_download_failed' });
        continue;
      }

      let sitRows;
      try {
        sitRows = parseExcel(buffer);
      } catch (err) {
        console.error(`[sit-intake] parseExcel failed for ${issue.key}:`, err);
        results.push({ jiraTicket: issue.key, status: 'error', reason: 'excel_parse_failed' });
        continue;
      }

      if (sitRows.length === 0) {
        results.push({ jiraTicket: issue.key, status: 'skipped', reason: 'empty_excel' });
        continue;
      }

      const generated = await generateDraftTask(issue.key, issue.summary, sitRows);

      const draft = await prisma.draftTask.create({
        data: {
          jiraTicket: issue.key,
          productId: product.id,
          rawExcelData: sitRows as object[],
          generatedData: generated as object,
          status: 'PENDING',
        }
      });

      // Notify all active admins
      const admins = await prisma.user.findMany({
        where: { role: 'ADMIN', isActive: true },
        select: { email: true, name: true }
      });

      await Promise.all(
        admins.map((admin) =>
          sendDraftTaskReadyEmail({
            to: admin.email,
            recipientName: admin.name,
            jiraTicket: issue.key,
            generatedTitle: generated.title,
            productName: product.name,
            draftTaskId: draft.id,
          })
        )
      );

      results.push({ jiraTicket: issue.key, status: 'created' });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
