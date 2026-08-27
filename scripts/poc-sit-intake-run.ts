#!/usr/bin/env tsx
/**
 * Run the AI Drafts pipeline once against a real workbook, without Jira or a
 * database. Exercises exactly the code the cron calls:
 *
 *   parseExcel()  →  generateDraftTask()  →  the DraftTask that would be stored
 *
 *   npx tsx scripts/poc-sit-intake-run.ts <file.xlsx> [JIRA-KEY] ["summary"]
 *
 * With no AI provider configured it reports the mechanical fallback instead of
 * pretending a model ran — `generatedBy` says which path was taken.
 */
import fs from 'node:fs';
import { parseExcel } from '../lib/parseExcel';
import { generateDraftTask } from '../lib/generateDraftTask';
import { loadAiConfig } from '../lib/aiProvider';

const file = process.argv[2];
if (!file) {
  console.error('usage: npx tsx scripts/poc-sit-intake-run.ts <file.xlsx> [JIRA-KEY] ["summary"]');
  process.exit(1);
}
const jiraKey = process.argv[3] || 'EO-0000';
const jiraSummary = process.argv[4] || 'SIT completed — ready for UAT';

const rule = (label: string) => console.log(`\n${'─'.repeat(66)}\n  ${label}\n${'─'.repeat(66)}`);

async function main() {
  rule('1. Provider');
  const config = await loadAiConfig();
  console.log(`provider : ${config.provider}`);
  console.log(`model    : ${config.model || '(provider default)'}`);
  console.log(`api key  : ${config.apiKey ? 'present' : 'MISSING — fallback path will run'}`);

  rule('2. parseExcel — the step that was reading the wrong sheet');
  const buffer = fs.readFileSync(file);
  const rows = await parseExcel(buffer);
  console.log(`parsed ${rows.length} SIT test case rows`);
  const stories = [...new Set(rows.map((r) => r.story).filter(Boolean))];
  if (stories.length) console.log(`stories in sheet: ${stories.join(', ')}`);
  if (rows.length === 0) {
    console.log('\nNo rows. Before the sheet fix this is what the cron saw, and it');
    console.log('recorded "empty_excel" and skipped the ticket without an error.');
    process.exit(1);
  }
  for (const r of rows.slice(0, 5)) {
    console.log(`  [${r.testCaseId}] ${r.result.padEnd(12)} ${r.title.slice(0, 58)}`);
  }
  if (rows.length > 5) console.log(`  … ${rows.length - 5} more`);

  rule(`3. generateDraftTask — rows scoped to ${jiraKey}`);
  const own = rows.filter((r) => r.story && r.story.toUpperCase() === jiraKey.toUpperCase());
  const rowsForTicket = own.length > 0 ? own : rows.filter((r) => !r.story);
  console.log(`${rowsForTicket.length} of ${rows.length} rows belong to ${jiraKey}`);
  const started = Date.now();
  const generated = await generateDraftTask(jiraKey, jiraSummary, rowsForTicket);
  console.log(`generatedBy : ${generated.generatedBy ?? 'unknown'}`);
  console.log(`took        : ${Date.now() - started} ms`);

  rule('4. DraftTask that would be stored for admin review');
  console.log(`title    : ${generated.title}`);
  console.log(`module   : ${generated.module}`);
  console.log(`priority : ${generated.priority}`);
  console.log(`steps    : ${generated.steps.length}`);
  console.log(`description:\n  ${generated.description.replace(/\n/g, '\n  ')}`);
  console.log('\nsteps:');
  generated.steps.forEach((s, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${s.description.slice(0, 88)}`);
    console.log(`      expect: ${s.expectedResult.slice(0, 84)}`);
  });

  if (generated.generatedBy === 'fallback') {
    rule('Note');
    console.log('This draft was built mechanically, not by a model. Configure a');
    console.log('provider at /admin/settings, or set ANTHROPIC_API_KEY / DEEPSEEK_API_KEY,');
    console.log('and re-run to see the model output.');
  }
}

main().catch((err) => {
  console.error('\npipeline failed:', err);
  process.exit(1);
});
