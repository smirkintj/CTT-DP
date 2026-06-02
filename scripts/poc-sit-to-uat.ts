/**
 * POC: SIT Excel → UAT Task
 *
 * Demonstrates the full pipeline:
 *   1. Build a realistic SIT Excel in-memory (simulates QA's attachment)
 *   2. Parse it with parseExcel()
 *   3. Call DeepSeek V4 Pro via generateDraftTask()
 *   4. Pretty-print each stage
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... npx tsx scripts/poc-sit-to-uat.ts
 *
 * Without a key the script still runs the parser and shows the fallback output.
 */

import * as XLSX from 'xlsx';
import { parseExcel } from '../lib/parseExcel';
import { generateDraftTask } from '../lib/generateDraftTask';

// ─── 1. Build a realistic SIT Excel in-memory ─────────────────────────────────

function buildSampleExcel(): Buffer {
  const rows = [
    // Header row
    ['Test Case ID', 'Title', 'Test Steps', 'Expected Result', 'Status'],

    // EasyOrder — Bulk Order Upload feature SIT cases
    [
      'TC-001',
      'Bulk Upload — Valid CSV (10 orders)',
      'Log in as buyer → Bulk Order Upload → upload valid CSV with 10 rows',
      'All 10 orders appear in order list within 30 s with status PENDING',
      'PASS',
    ],
    [
      'TC-002',
      'Bulk Upload — Missing Product Code column',
      'Upload CSV where "Product Code" column is absent',
      'System shows error: "Invalid file format — required columns missing"',
      'PASS',
    ],
    [
      'TC-003',
      'Bulk Upload — Duplicate order number',
      'Upload CSV containing two rows with the same order reference',
      'System rejects duplicate, shows "Order reference already exists" for the second row',
      'PASS',
    ],
    [
      'TC-004',
      'Order status auto-sync after upload',
      'Submit upload → wait 90 seconds',
      'Order statuses transition from PENDING → CONFIRMED automatically',
      'PASS',
    ],
    [
      'TC-005',
      'Order cancellation within 5 min window',
      'Cancel an uploaded order within 5 minutes of submission',
      'Status changes to CANCELLED; confirmation email received by buyer',
      'PASS',
    ],
    [
      'TC-006',
      'Partial shipment — tracking numbers visible',
      'Open an order that has 2 partial shipments',
      'Both tracking numbers displayed with correct quantities per shipment',
      'PASS',
    ],
    [
      'TC-007',
      'Bulk Upload — Large file (500 orders)',
      'Upload a valid CSV with 500 order rows',
      'All 500 orders processed; no timeout; progress indicator shown',
      'CONDITIONAL',
    ],
    [
      'TC-008',
      'Download order template',
      'Click "Download CSV Template" button',
      'CSV template downloaded with correct column headers',
      'PASS',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'SIT Results');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return buf;
}

// ─── 2. Helpers ───────────────────────────────────────────────────────────────

const hr = (label: string) =>
  console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);

const json = (obj: unknown) => console.log(JSON.stringify(obj, null, 2));

// ─── 3. Main ──────────────────────────────────────────────────────────────────

async function main() {
  const hasKey = !!process.env.DEEPSEEK_API_KEY;
  console.log('\n🔬  CTT — SIT Excel → UAT Task POC');
  console.log(`    DeepSeek API key: ${hasKey ? '✅ present' : '⚠️  missing (will use fallback)'}`);

  // Stage 1 — build Excel
  hr('Stage 1 · Build sample SIT Excel');
  const buffer = buildSampleExcel();
  console.log(`Created in-memory Excel: ${buffer.byteLength} bytes`);

  // Stage 2 — parse
  hr('Stage 2 · Parse Excel → SitTestRow[]');
  const rows = parseExcel(buffer);
  console.log(`Parsed ${rows.length} test case rows:\n`);
  rows.forEach((r, i) => {
    console.log(`  [${i + 1}] ${r.testCaseId}  ${r.result.padEnd(12)}  ${r.title}`);
    if (r.steps[0]) {
      console.log(`       Action:   ${r.steps[0].action.slice(0, 80)}`);
      console.log(`       Expected: ${r.steps[0].expected.slice(0, 80)}`);
    }
  });

  // Stage 3 — generate UAT task via DeepSeek
  hr('Stage 3 · Generate UAT task via DeepSeek V4 Pro');
  if (!hasKey) {
    console.log('⚠️  No DEEPSEEK_API_KEY — running in fallback mode.\n');
    console.log('    Rerun with:  DEEPSEEK_API_KEY=sk-... npx tsx scripts/poc-sit-to-uat.ts\n');
  } else {
    console.log('Calling DeepSeek…');
  }

  const start = Date.now();
  const generated = await generateDraftTask(
    'EO-9999',
    'Bulk Order Upload & Order Management',
    rows,
  );
  const elapsed = Date.now() - start;

  hr(`Stage 4 · Result  (${elapsed} ms)`);
  console.log(`\n  Title:       ${generated.title}`);
  console.log(`  Module:      ${generated.module}`);
  console.log(`  Priority:    ${generated.priority}`);
  console.log(`\n  Description:\n  ${generated.description}\n`);
  console.log(`  Steps (${generated.steps.length}):`);
  generated.steps.forEach((s, i) => {
    console.log(`\n  ${i + 1}. ${s.description}`);
    console.log(`     → ${s.expectedResult}`);
  });

  hr('Done');
  console.log('\nThis is exactly what gets saved to DraftTask.generatedData in the DB.');
  console.log('Admin reviews & edits at /admin/draft-tasks before tasks are created.\n');
}

main().catch((err) => {
  console.error('\n❌ Error:', err);
  process.exit(1);
});
