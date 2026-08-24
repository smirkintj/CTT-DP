#!/usr/bin/env node
/**
 * Extract SIT test cases from a DKSH QA test-suite workbook into CTT
 * Task + TaskStep shape.
 *
 *   node scripts/extract-sit-testcases.mjs <file.xlsx> [--json out.json]
 *
 * Notes on the source format (DKSH "Group Product Engineering & QA 1.0 Suite"):
 *  - The workbook has a "Guideline" cover sheet first and the real data in a
 *    later sheet, so the sheet is resolved by header signature, never by index.
 *  - One spreadsheet row = one test case = one TaskStep. Rows are grouped into
 *    Tasks by Jira user story, which is how CTT models a unit of UAT work.
 *  - The uploaded file is normally the QA's *executed* sheet, so it carries
 *    their run: verdict, evidence links, tester names, SIT environment. That is
 *    a record of SIT, not input to UAT, and is dropped — see DROPPED_COLUMNS.
 *    Carrying it over would pre-answer a UAT run nobody has performed yet.
 */
import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';

const REQUIRED_HEADERS = ['Test Case ID', 'Steps', 'Expected Result'];

const HEADER_ALIASES = {
  testCaseId: ['test case id', 'tc id', 'case id'],
  name: ['test case name', 'test name', 'title'],
  description: ['description', 'objective'],
  steps: ['steps', 'test steps', 'step'],
  expected: ['expected result', 'expected outcome', 'expected'],
  testData: ['test data', 'data'],
  actual: ['actual result/ comments', 'actual result', 'comments'],
  status: ['status', 'result'],
  priority: ['priority'],
  jira: ['user story id (jira)', 'user story id', 'jira'],
  module: ['module', 'feature'],
  environment: ['environment', 'env'],
  category: ['test case category', 'category']
};

const COUNTRY_CODES = ['MY', 'SG', 'TH', 'VN', 'TW', 'HK', 'CN', 'ID', 'PH', 'KR', 'JP', 'IN', 'AU', 'NZ'];

/**
 * Columns read only to derive task fields, then discarded. They describe how
 * SIT was executed and would be stale or misleading on a new UAT task.
 * Reported by --report so a reviewer can see what was removed.
 */
const DROPPED_COLUMNS = {
  status: 'SIT verdict (Pass/Fail/Not Started) — UAT starts unanswered',
  actual: 'SIT actual result and evidence links — belongs to the SIT run',
  tester: 'SIT tester name and execution date',
  environment: 'SIT environment — UAT targets its own environment',
  sprint: 'Sprint ID — SIT planning metadata'
};

/** Evidence/recording links QA paste into cells (jam.dev, Loom, screenshots). */
const EVIDENCE_URL = /https?:\/\/\S*(jam\.dev|loom\.com|drive\.google|sharepoint|imgur)\S*/gi;

/** Remove evidence links and trailing verdict noise that leaked into a cell. */
function stripRunResidue(text) {
  return clean(text)
    .replace(EVIDENCE_URL, '')
    .replace(/^\s*(pass|fail|passed|failed|not started|blocked|n\/?a)\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveSheet(wb) {
  // Score every sheet by how many required headers appear in its first rows.
  // The cover sheet scores zero, so a renamed data sheet still resolves.
  let best = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' });
    for (let r = 0; r < Math.min(rows.length, 10); r += 1) {
      const cells = rows[r].map((c) => String(c ?? '').trim().toLowerCase());
      const hits = REQUIRED_HEADERS.filter((h) =>
        cells.some((c) => c === h.toLowerCase())
      ).length;
      if (hits && (!best || hits > best.hits)) {
        best = { name, rows, headerRow: r, hits };
      }
    }
  }
  return best;
}

function buildIndex(headerCells) {
  const norm = headerCells.map((c) => String(c ?? '').trim().toLowerCase().replace(/\s+/g, ' '));
  const index = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    let found = -1;
    for (const alias of aliases) {
      found = norm.findIndex((c) => c === alias);
      if (found !== -1) break;
    }
    if (found === -1) {
      for (const alias of aliases) {
        found = norm.findIndex((c) => c.startsWith(alias));
        if (found !== -1) break;
      }
    }
    index[key] = found;
  }
  return index;
}

const clean = (v) => String(v ?? '').replace(/\r\n/g, '\n').replace(/ /g, ' ').trim();

function mapPriority(raw) {
  const v = clean(raw).toLowerCase();
  if (v.includes('high') || v.startsWith('1') || v.startsWith('2')) return 'HIGH';
  if (v.includes('low')) return 'LOW';
  return 'MEDIUM';
}

/** Country signals live in the module prefix ("[SG] ...") or the Test Data cell. */
function detectCountries(...sources) {
  const found = new Set();
  for (const src of sources) {
    const text = clean(src);
    if (!text) continue;
    const bracket = text.match(/\[([A-Z]{2})\]/g) || [];
    bracket.forEach((b) => {
      const code = b.slice(1, -1);
      if (COUNTRY_CODES.includes(code)) found.add(code);
    });
    // A cell that is exactly a country code (the Test Data column is used this
    // way for per-market coverage), or "TH:12345" style prefixed data.
    if (COUNTRY_CODES.includes(text.toUpperCase())) found.add(text.toUpperCase());
    const prefixed = text.match(/^([A-Z]{2}):/gm) || [];
    prefixed.forEach((p) => {
      const code = p.slice(0, 2);
      if (COUNTRY_CODES.includes(code)) found.add(code);
    });
  }
  return [...found];
}

function stripCountryPrefix(module) {
  return clean(module).replace(/^\[[A-Z]{2}\]\s*/, '').trim();
}

/** Split the Steps cell into preconditions and the numbered action list. */
function parseSteps(raw) {
  const text = clean(raw);
  if (!text) return { preconditions: '', actions: [] };

  let preconditions = '';
  let body = text;

  const marker = text.match(/^\s*(pre-?conditions?)\s*:/im);
  if (marker) {
    const afterLabel = text.slice(marker.index + marker[0].length);
    const stepsLabel = afterLabel.match(/\n\s*test steps?\s*:/i);
    if (stepsLabel) {
      preconditions = afterLabel.slice(0, stepsLabel.index).trim();
      body = afterLabel.slice(stepsLabel.index + stepsLabel[0].length);
    } else {
      preconditions = afterLabel.trim();
      body = '';
    }
  } else {
    body = text.replace(/^\s*test steps?\s*:/im, '');
  }

  const actions = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // "1.Login to Easy Order" / "1) Login" / "1. Login"
    const numbered = t.match(/^(\d+)[.)]\s*(.+)$/);
    if (numbered) {
      actions.push(numbered[2].trim());
    } else if (actions.length) {
      // Continuation of the previous numbered step (wrapped sub-bullet).
      actions[actions.length - 1] += ` ${t}`;
    } else {
      actions.push(t);
    }
  }
  return { preconditions, actions };
}

/** Expected Result is a "Validate the following:" header plus dash bullets. */
function parseExpected(raw) {
  const text = clean(raw).replace(/^\s*validate the following\s*:?\s*/i, '').trim();
  const bullets = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (/^[-•*]\s*/.test(t)) {
      bullets.push(t.replace(/^[-•*]\s*/, '').trim());
    } else if (bullets.length) {
      bullets[bullets.length - 1] += ` ${t}`;
    } else {
      bullets.push(t);
    }
  }
  return bullets;
}

function extract(filePath) {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
  const sheet = resolveSheet(wb);
  if (!sheet) {
    throw new Error(
      `No sheet with test-case headers found. Sheets: ${wb.SheetNames.join(', ')}`
    );
  }

  const idx = buildIndex(sheet.rows[sheet.headerRow]);
  const cell = (row, key) => (idx[key] === -1 ? '' : clean(row[idx[key]]));

  const cases = [];
  for (let r = sheet.headerRow + 1; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    if (!row || !clean(row[idx.testCaseId])) continue;
    if (!cell(row, 'name') && !cell(row, 'steps')) continue;

    const { preconditions, actions } = parseSteps(stripRunResidue(cell(row, 'steps')));
    const rawTestData = cell(row, 'testData');
    cases.push({
      excelRow: r + 1,
      testCaseId: cell(row, 'testCaseId'),
      name: cell(row, 'name'),
      description: stripRunResidue(cell(row, 'description')),
      preconditions,
      actions,
      expected: parseExpected(stripRunResidue(cell(row, 'expected'))),
      // A cell holding only a country code is a market marker, not test data —
      // it feeds country detection below and is not carried onto the step.
      testData: COUNTRY_CODES.includes(rawTestData.toUpperCase()) ? '' : stripRunResidue(rawTestData),
      // Read for the dropped-column report only; never emitted onto a step.
      sitStatus: cell(row, 'status'),
      sitEvidence: cell(row, 'actual'),
      priority: mapPriority(cell(row, 'priority')),
      jira: cell(row, 'jira'),
      module: cell(row, 'module'),
      environment: cell(row, 'environment'),
      category: cell(row, 'category'),
      countries: detectCountries(cell(row, 'module'), cell(row, 'testData'))
    });
  }

  // Group into Tasks by Jira story (falling back to module when absent).
  const groups = new Map();
  for (const c of cases) {
    const key = c.jira || c.module || 'UNGROUPED';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const PRIORITY_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 };
  const tasks = [];
  for (const [key, items] of groups) {
    const countries = [...new Set(items.flatMap((i) => i.countries))];
    const priority = items
      .map((i) => i.priority)
      .reduce((a, b) => (PRIORITY_RANK[b] > PRIORITY_RANK[a] ? b : a), 'LOW');

    tasks.push({
      jiraTicket: items[0].jira || null,
      title: stripCountryPrefix(items[0].module) || key,
      description: `${stripCountryPrefix(items[0].module) || key} — ${items.length} test case(s) to verify for ${key}.`,
      module: stripCountryPrefix(items[0].module) || null,
      priority,
      status: 'DRAFT',
      // Single value in the schema; when SIT covered several markets each needs
      // its own Task (CTT links them via taskGroupId).
      countryCode: countries.length === 1 ? countries[0] : null,
      detectedCountries: countries,
      needsCountrySplit: countries.length > 1,
      steps: items.map((c, i) => {
        const desc = [
          c.name,
          c.description ? `\n${c.description}` : '',
          c.preconditions ? `\n\nPreconditions:\n${c.preconditions}` : '',
          c.actions.length
            ? `\n\nSteps:\n${c.actions.map((a, n) => `${n + 1}. ${a}`).join('\n')}`
            : ''
        ].join('').trim();

        return {
          order: i + 1,
          description: desc,
          expectedResult: c.expected.map((e) => `- ${e}`).join('\n'),
          testData: c.testData || null,
          // Left empty on purpose — this is a fresh UAT run, not SIT's verdict.
          actualResult: null,
          // Provenance, not SIT run data: lets a reviewer trace a step back to
          // its spreadsheet row.
          sourceRow: c.excelRow
        };
      })
    });
  }

  const dropped = Object.entries(DROPPED_COLUMNS).map(([key, why]) => ({
    column: key,
    why,
    nonEmptyCells:
      key === 'status' ? cases.filter((c) => c.sitStatus).length
      : key === 'actual' ? cases.filter((c) => c.sitEvidence).length
      : null
  }));

  return {
    sheetName: sheet.name,
    headerRow: sheet.headerRow + 1,
    caseCount: cases.length,
    dropped,
    tasks
  };
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/extract-sit-testcases.mjs <file.xlsx> [--json out.json]');
  process.exit(1);
}

const result = extract(file);

const jsonFlag = process.argv.indexOf('--json');
if (jsonFlag !== -1 && process.argv[jsonFlag + 1]) {
  const out = path.resolve(process.argv[jsonFlag + 1]);
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(`wrote ${out}`);
}

console.log(`sheet "${result.sheetName}" (header row ${result.headerRow}) — ${result.caseCount} test cases → ${result.tasks.length} tasks\n`);
for (const t of result.tasks) {
  const country = t.countryCode ?? (t.needsCountrySplit ? `SPLIT:${t.detectedCountries.join('/')}` : 'UNKNOWN');
  console.log(`${t.jiraTicket ?? '—'}  [${t.priority}]  ${country}  ${t.steps.length} steps  ${t.title}`);
  for (const s of t.steps) {
    const head = s.description.split('\n')[0];
    console.log(`    ${String(s.order).padStart(2)}. ${head.slice(0, 66)}  (${s.expectedResult.split('\n').length} checks)`);
  }
}

console.log('\nDropped SIT execution columns:');
for (const d of result.dropped) {
  const count = d.nonEmptyCells === null ? '' : ` [${d.nonEmptyCells} cells]`;
  console.log(`  - ${d.column}${count}: ${d.why}`);
}
