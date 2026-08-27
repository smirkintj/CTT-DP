/**
 * SIT intake: find Jira tickets QA has marked SIT-complete, turn the attached
 * test-case workbook into a DraftTask, and notify admins.
 *
 * Shared by the daily cron and the admin "Check Jira now" button so both do
 * exactly the same work.
 */
import prisma from './prisma';
import { searchJiraIssuesWithKeywordComment, fetchJiraAttachment } from './jira';
import { parseExcel } from './parseExcel';
import { generateDraftTask } from './generateDraftTask';
import { sendDraftTaskReadyEmail } from './email';

const SIT_COMPLETE_KEYWORD = process.env.SIT_COMPLETE_KEYWORD || 'SIT completed';

// Must cover the gap between runs, plus overlap so nothing is missed at the
// boundary. Vercel Hobby allows one cron run per day, so this defaults to 26h.
// Already-processed tickets are skipped below, so re-scanning is harmless.
const POLL_WINDOW_HOURS = Number(process.env.SIT_POLL_WINDOW_HOURS) || 26;

export type SitIntakeResult = {
  jiraTicket: string;
  status: 'created' | 'skipped' | 'error';
  reason?: string;
};

export type SitIntakeSummary = {
  productsScanned: number;
  issuesSeen: number;
  created: number;
  results: SitIntakeResult[];
};

export async function runSitIntake(): Promise<SitIntakeSummary> {
  let issuesSeen = 0;
  const results: SitIntakeResult[] = [];

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

    issuesSeen += issues.length;
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
        sitRows = await parseExcel(buffer);
      } catch (err) {
        console.error(`[sit-intake] parseExcel failed for ${issue.key}:`, err);
        results.push({ jiraTicket: issue.key, status: 'error', reason: 'excel_parse_failed' });
        continue;
      }

      if (sitRows.length === 0) {
        results.push({ jiraTicket: issue.key, status: 'skipped', reason: 'empty_excel' });
        continue;
      }

      // A sprint workbook usually covers several stories. Draft only the rows
      // belonging to this ticket, or the whole sheet when it carries no story
      // column (a single-story export).
      const ownRows = sitRows.filter(
        (r) => r.story && r.story.toUpperCase() === issue.key.toUpperCase()
      );
      const rowsForTicket = ownRows.length > 0 ? ownRows : sitRows.filter((r) => !r.story);

      if (rowsForTicket.length === 0) {
        results.push({ jiraTicket: issue.key, status: 'skipped', reason: 'no_rows_for_ticket' });
        continue;
      }

      const generated = await generateDraftTask(issue.key, issue.summary, rowsForTicket);

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


  return {
    productsScanned: products.length,
    issuesSeen,
    created: results.filter((r) => r.status === 'created').length,
    results
  };
}
