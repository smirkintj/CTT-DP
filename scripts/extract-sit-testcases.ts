#!/usr/bin/env tsx
/**
 * Extract SIT test cases from a DKSH QA test-suite workbook into CTT
 * Task + TaskStep shape.
 *
 *   npx tsx scripts/extract-sit-testcases.ts <file.xlsx> [--json out.json] [--story EO-3066,EO-3282]
 *
 * Parsing lives in lib/sitWorkbook.ts and is shared with the import wizard, so
 * the CLI and the UI cannot drift apart.
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import {
  DROPPED_COLUMNS,
  buildHeaderIndex,
  clean,
  groupByStory,
  readCases,
  resolveSheet,
  toDraftTask
} from '../lib/sitWorkbook';

const file = process.argv[2];
if (!file) {
  console.error(
    'usage: npx tsx scripts/extract-sit-testcases.ts <file.xlsx> [--json out.json] [--story KEY,KEY]'
  );
  process.exit(1);
}

const flag = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
const sheets = wb.SheetNames.map((name) => ({
  name,
  rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], {
    header: 1,
    defval: ''
  }) as string[][]
}));

const sheet = resolveSheet(sheets);
if (!sheet) {
  console.error(`No sheet with test-case headers found. Sheets: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}

const idx = buildHeaderIndex(sheet.rows[sheet.headerRow]);
const cases = readCases(sheet, idx);
let groups = groupByStory(cases);

// A sprint sheet carries several stories; --story drafts only the chosen ones,
// mirroring the picker in the import wizard.
const wanted = flag('--story');
if (wanted) {
  const keys = wanted.split(',').map((k) => k.trim()).filter(Boolean);
  const missing = keys.filter((k) => !groups.some((g) => g.key === k));
  if (missing.length) {
    console.error(`Unknown story key(s): ${missing.join(', ')}`);
    console.error(`Available: ${groups.map((g) => g.key).join(', ')}`);
    process.exit(1);
  }
  groups = groups.filter((g) => keys.includes(g.key));
}

const tasks = groups.map(toDraftTask);

const statusIdx = idx.status;
const actualIdx = idx.actual;
const countNonEmpty = (col: number) =>
  col === -1
    ? null
    : sheet.rows.slice(sheet.headerRow + 1).filter((r) => clean(r?.[col])).length;

const dropped = Object.entries(DROPPED_COLUMNS).map(([column, why]) => ({
  column,
  why,
  nonEmptyCells:
    column === 'status' ? countNonEmpty(statusIdx)
    : column === 'actual' ? countNonEmpty(actualIdx)
    : null
}));

const result = {
  sheetName: sheet.name,
  headerRow: sheet.headerRow + 1,
  caseCount: cases.length,
  dropped,
  tasks
};

const out = flag('--json');
if (out) {
  const target = path.resolve(out);
  fs.writeFileSync(target, JSON.stringify(result, null, 2));
  console.log(`wrote ${target}`);
}

console.log(
  `sheet "${result.sheetName}" (header row ${result.headerRow}) — ${result.caseCount} test cases → ${tasks.length} tasks\n`
);
for (const t of tasks) {
  const country = t.countryCode ?? (t.needsCountrySplit ? `SPLIT:${t.detectedCountries.join('/')}` : 'UNKNOWN');
  console.log(`${t.jiraTicket ?? '—'}  [${t.priority}]  ${country}  ${t.steps.length} steps  ${t.title}`);
  for (const s of t.steps) {
    const head = s.description.split('\n')[0];
    console.log(
      `    ${String(s.order).padStart(2)}. ${head.slice(0, 66)}  (${s.expectedResult.split('\n').length} checks)`
    );
  }
}

console.log('\nDropped SIT execution columns:');
for (const d of dropped) {
  const count = d.nonEmptyCells === null ? '' : ` [${d.nonEmptyCells} cells]`;
  console.log(`  - ${d.column}${count}: ${d.why}`);
}
