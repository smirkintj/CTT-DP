/**
 * SIT intake: find Jira tickets QA has marked SIT-complete, turn the attached
 * test-case workbook into a DraftTask, and notify admins.
 *
 * Shared by the daily cron and the admin "Check Jira now" button so both do
 * exactly the same work.
 */
import prisma from './prisma';
import { searchJiraIssuesWithKeywordComment, fetchJiraAttachmentDetailed } from './jira';
import { readWorkbookStories } from './sitWorkbookServer';
import { draftTaskFromStory } from './draftTask';
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
  /** Per-product diagnostics: the JQL run, how many it matched, any error. */
  scans: Array<{ product: string; jql: string; matched: number; error?: string }>;
  keyword: string;
  windowHours: number;
};

export type SitIntakeOptions = {
  /**
   * Recency bound in hours. The scheduled run only needs to cover the gap
   * since the last one; a manual run passes 0 for "no bound", so an admin
   * checking a ticket QA finished last week actually finds it.
   */
  windowHours?: number;
};

export async function runSitIntake(options: SitIntakeOptions = {}): Promise<SitIntakeSummary> {
  const windowHours = options.windowHours ?? POLL_WINDOW_HOURS;
  const scans: SitIntakeSummary['scans'] = [];
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

    const outcome = await searchJiraIssuesWithKeywordComment(
      product.jiraProjectKey,
      SIT_COMPLETE_KEYWORD,
      windowHours,
      perProduct
    );
    const issues = outcome.issues;

    scans.push({
      product: product.name,
      jql: outcome.jql,
      matched: issues.length,
      error: outcome.error
    });

    issuesSeen += issues.length;
    for (const issue of issues) {
     try {
      // Skip if already processed
      const existing = await prisma.draftTask.findUnique({ where: { jiraTicket: issue.key } });
      if (existing) {
        results.push({ jiraTicket: issue.key, status: 'skipped', reason: 'already_processed' });
        continue;
      }

      // Need at least one Excel attachment
      if (issue.attachments.length === 0) {
        results.push({
          jiraTicket: issue.key,
          status: 'skipped',
          reason: issue.allAttachmentNames.length
            ? `no_excel_attachment (has: ${issue.allAttachmentNames.join(', ').slice(0, 120)})`
            : 'no_attachments_at_all'
        });
        continue;
      }

      const attachment = issue.attachments[0];
      const download = await fetchJiraAttachmentDetailed(attachment.content, perProduct);
      if (!download.buffer) {
        results.push({
          jiraTicket: issue.key,
          status: 'error',
          reason: `attachment_download_failed (${attachment.filename}: ${download.error ?? 'unknown'})`
        });
        continue;
      }
      const buffer = download.buffer;

      let stories;
      try {
        stories = await readWorkbookStories(buffer);
      } catch (err) {
        console.error(`[sit-intake] could not read workbook for ${issue.key}:`, err);
        results.push({ jiraTicket: issue.key, status: 'error', reason: 'excel_parse_failed' });
        continue;
      }

      if (stories.length === 0) {
        results.push({ jiraTicket: issue.key, status: 'skipped', reason: 'empty_excel' });
        continue;
      }

      // A sprint workbook usually covers several stories. Draft only the one
      // belonging to this ticket, or the sole story when the sheet carries no
      // story column (a single-story export).
      const own = stories.find((g) => g.key.toUpperCase() === issue.key.toUpperCase());
      const story = own ?? (stories.length === 1 && !stories[0].story ? stories[0] : null);

      if (!story) {
        results.push({ jiraTicket: issue.key, status: 'skipped', reason: 'no_rows_for_ticket' });
        continue;
      }

      const generated = await draftTaskFromStory(story, { productName: product.name });

      const draft = await prisma.draftTask.create({
        data: {
          jiraTicket: issue.key,
          productId: product.id,
          rawExcelData: story.cases as unknown as object[],
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
     } catch (error) {
       // A unique-constraint clash (manual run overlapping the cron) or a
       // single bad workbook must not abort the whole scan.
       console.error(`[sit-intake] ${issue.key} failed:`, error);
       results.push({
         jiraTicket: issue.key,
         status: 'error',
         reason: error instanceof Error ? error.message.slice(0, 160) : 'unexpected failure'
       });
     }
    }
  }


  return {
    productsScanned: products.length,
    issuesSeen,
    created: results.filter((r) => r.status === 'created').length,
    results,
    scans,
    keyword: SIT_COMPLETE_KEYWORD,
    windowHours
  };
}
