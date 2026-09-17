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
import { readWorkbookStories } from '../lib/sitWorkbookServer';
import { draftTaskFromStory } from '../lib/draftTask';
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

  rule('2. Reading the workbook');
  const buffer = fs.readFileSync(file);
  const stories = await readWorkbookStories(buffer);
  const caseCount = stories.reduce((n, g) => n + g.cases.length, 0);
  console.log(`parsed ${caseCount} SIT test case(s) across ${stories.length} story group(s)`);
  if (stories.length === 0) {
    console.log('\nNo rows. Before the sheet fix this is what the cron saw, and it');
    console.log('recorded "empty_excel" and skipped the ticket without an error.');
    process.exit(1);
  }
  for (const g of stories) {
    console.log(`  ${g.key.padEnd(10)} ${g.cases.length} case(s)  ${g.title.slice(0, 50)}`);
  }

  rule(`3. Drafting ${jiraKey}`);
  const own = stories.find((g) => g.key.toUpperCase() === jiraKey.toUpperCase());
  const story = own ?? (stories.length === 1 ? stories[0] : null);
  if (!story) {
    console.log(`No story matches ${jiraKey}. Available: ${stories.map((g) => g.key).join(', ')}`);
    process.exit(1);
  }
  console.log(`${story.cases.length} of ${caseCount} case(s) belong to ${story.key}`);
  const started = Date.now();
  const generated = await draftTaskFromStory(story);
  console.log(`generatedBy : ${generated.generatedBy}`);
  if (generated.fallbackReason) console.log(`fallback    : ${generated.fallbackReason}`);
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
