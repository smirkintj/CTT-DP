/**
 * Shared parsing for DKSH QA test-suite workbooks (the "Group Product
 * Engineering & QA 1.0 Suite" template) and for flat CSV exports.
 *
 * Used by both the import wizard (browser) and scripts/extract-sit-testcases.ts
 * (node), so it must stay free of DOM and node APIs — callers hand it rows that
 * they have already read with xlsx/exceljs or a CSV parser.
 */

export type SheetInput = { name: string; rows: string[][] };

export type ResolvedSheet = {
  name: string;
  rows: string[][];
  headerRow: number;
  score: number;
};

export type HeaderIndex = Record<string, number>;

export type SitCase = {
  sourceRow: number;
  testCaseId: string;
  name: string;
  description: string;
  preconditions: string;
  actions: string[];
  expected: string[];
  testData: string;
  priority: TaskPriorityValue;
  story: string;
  module: string;
  countries: string[];
};

export type StoryGroup = {
  /** Jira key when present, otherwise the module name. */
  key: string;
  story: string;
  module: string;
  title: string;
  priority: TaskPriorityValue;
  caseCount: number;
  countries: string[];
  needsCountrySplit: boolean;
  cases: SitCase[];
};

export type DraftStep = {
  order: number;
  description: string;
  expectedResult: string;
  testData: string | null;
  actualResult: null;
  sourceRow: number;
};

export type DraftTaskShape = {
  jiraTicket: string | null;
  title: string;
  description: string;
  module: string | null;
  priority: TaskPriorityValue;
  status: 'DRAFT';
  countryCode: string | null;
  detectedCountries: string[];
  needsCountrySplit: boolean;
  steps: DraftStep[];
};

export type TaskPriorityValue = 'LOW' | 'MEDIUM' | 'HIGH';

/** Headers that identify the sheet actually holding test cases. */
const SIGNATURE_HEADERS = ['test case id', 'steps', 'expected result'];

const HEADER_ALIASES: Record<string, string[]> = {
  testCaseId: ['test case id', 'tc id', 'case id', 'test case no'],
  name: ['test case name', 'test name', 'title', 'scenario'],
  description: ['description', 'objective', 'summary'],
  steps: ['steps', 'test steps', 'step', 'action'],
  expected: ['expected result', 'expected outcome', 'expected'],
  testData: ['test data', 'data'],
  actual: ['actual result/ comments', 'actual result', 'comments'],
  status: ['status', 'result'],
  priority: ['priority'],
  story: ['user story id (jira)', 'user story id', 'jira', 'jira id', 'ticket'],
  module: ['module', 'feature'],
  environment: ['environment', 'env'],
  category: ['test case category', 'category']
};

export const COUNTRY_CODES = [
  'MY', 'SG', 'TH', 'VN', 'TW', 'HK', 'CN', 'ID', 'PH', 'KR', 'JP', 'IN', 'AU', 'NZ'
];

/**
 * Columns describing how SIT was executed. Read for reporting, never written
 * onto a task — the upload is usually QA's completed sheet and carrying their
 * verdict over would pre-answer a UAT run nobody has done yet.
 */
export const DROPPED_COLUMNS: Record<string, string> = {
  status: 'SIT verdict (Pass/Fail/Not Started) — UAT starts unanswered',
  actual: 'SIT actual result and evidence links — belongs to the SIT run',
  tester: 'SIT tester name and execution date',
  environment: 'SIT environment — UAT targets its own environment',
  sprint: 'Sprint ID — SIT planning metadata'
};

const EVIDENCE_URL = /https?:\/\/\S*(jam\.dev|loom\.com|drive\.google|sharepoint|imgur)\S*/gi;

export const clean = (v: unknown): string =>
  String(v ?? '').replace(/\r\n/g, '\n').replace(/ /g, ' ').trim();

/** Remove evidence links and stray verdict words that leaked into a cell. */
export function stripRunResidue(text: unknown): string {
  return clean(text)
    .replace(EVIDENCE_URL, '')
    .replace(/^\s*(pass|fail|passed|failed|not started|blocked|n\/?a)\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Pick the sheet holding test cases by header signature rather than by index.
 * These workbooks lead with a "Guideline" cover sheet, so sheet 0 is the wrong
 * default; scoring also survives a renamed or reordered data sheet.
 */
export function resolveSheet(sheets: SheetInput[]): ResolvedSheet | null {
  let best: ResolvedSheet | null = null;
  for (const sheet of sheets) {
    const limit = Math.min(sheet.rows.length, 10);
    for (let r = 0; r < limit; r += 1) {
      const cells = (sheet.rows[r] || []).map((c) => clean(c).toLowerCase());
      const score = SIGNATURE_HEADERS.filter((h) => cells.some((c) => c === h)).length;
      if (score > 0 && (!best || score > best.score)) {
        best = { name: sheet.name, rows: sheet.rows, headerRow: r, score };
      }
    }
  }
  return best;
}

export function buildHeaderIndex(headerCells: string[]): HeaderIndex {
  const norm = (headerCells || []).map((c) => clean(c).toLowerCase().replace(/\s+/g, ' '));
  const index: HeaderIndex = {};
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

export function mapPriority(raw: unknown): TaskPriorityValue {
  const v = clean(raw).toLowerCase();
  if (v.includes('high') || v.startsWith('1') || v.startsWith('2')) return 'HIGH';
  if (v.includes('low')) return 'LOW';
  return 'MEDIUM';
}

/** Country signals live in a module prefix ("[SG] …") or the Test Data cell. */
export function detectCountries(...sources: unknown[]): string[] {
  const found = new Set<string>();
  for (const src of sources) {
    const text = clean(src);
    if (!text) continue;
    for (const b of text.match(/\[([A-Z]{2})\]/g) || []) {
      const code = b.slice(1, -1);
      if (COUNTRY_CODES.includes(code)) found.add(code);
    }
    if (COUNTRY_CODES.includes(text.toUpperCase())) found.add(text.toUpperCase());
    for (const p of text.match(/^([A-Z]{2}):/gm) || []) {
      const code = p.slice(0, 2);
      if (COUNTRY_CODES.includes(code)) found.add(code);
    }
  }
  return [...found];
}

export function stripCountryPrefix(module: unknown): string {
  return clean(module).replace(/^\[[A-Z]{2}\]\s*/, '').trim();
}

/** Split a Steps cell into preconditions and the numbered action list. */
export function parseSteps(raw: unknown): { preconditions: string; actions: string[] } {
  const text = clean(raw);
  if (!text) return { preconditions: '', actions: [] };

  let preconditions = '';
  let body = text;

  const marker = text.match(/^\s*(pre-?conditions?)\s*:/im);
  if (marker && marker.index !== undefined) {
    const afterLabel = text.slice(marker.index + marker[0].length);
    const stepsLabel = afterLabel.match(/\n\s*test steps?\s*:/i);
    if (stepsLabel && stepsLabel.index !== undefined) {
      preconditions = afterLabel.slice(0, stepsLabel.index).trim();
      body = afterLabel.slice(stepsLabel.index + stepsLabel[0].length);
    } else {
      preconditions = afterLabel.trim();
      body = '';
    }
  } else {
    body = text.replace(/^\s*test steps?\s*:/im, '');
  }

  const actions: string[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const numbered = t.match(/^(\d+)[.)]\s*(.+)$/);
    if (numbered) {
      actions.push(numbered[2].trim());
    } else if (actions.length) {
      actions[actions.length - 1] += ` ${t}`;
    } else {
      actions.push(t);
    }
  }
  return { preconditions, actions };
}

/** Expected Result is a "Validate the following:" header plus dash bullets. */
export function parseExpected(raw: unknown): string[] {
  const text = clean(raw).replace(/^\s*validate the following\s*:?\s*/i, '').trim();
  const bullets: string[] = [];
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

export function readCases(sheet: ResolvedSheet, idx: HeaderIndex): SitCase[] {
  const at = (row: string[], key: string) => (idx[key] === -1 ? '' : clean(row[idx[key]]));
  const cases: SitCase[] = [];

  for (let r = sheet.headerRow + 1; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    if (!row) continue;
    if (idx.testCaseId !== -1 && !clean(row[idx.testCaseId])) continue;
    if (!at(row, 'name') && !at(row, 'steps')) continue;

    const { preconditions, actions } = parseSteps(stripRunResidue(at(row, 'steps')));
    const rawTestData = at(row, 'testData');

    cases.push({
      sourceRow: r + 1,
      testCaseId: at(row, 'testCaseId'),
      name: at(row, 'name'),
      description: stripRunResidue(at(row, 'description')),
      preconditions,
      actions,
      expected: parseExpected(stripRunResidue(at(row, 'expected'))),
      // A cell holding only a country code is a market marker, not test data.
      testData: COUNTRY_CODES.includes(rawTestData.toUpperCase())
        ? ''
        : stripRunResidue(rawTestData),
      priority: mapPriority(at(row, 'priority')),
      story: at(row, 'story'),
      module: at(row, 'module'),
      countries: detectCountries(at(row, 'module'), rawTestData)
    });
  }
  return cases;
}

const PRIORITY_RANK: Record<TaskPriorityValue, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * Group cases by Jira story. A sprint sheet normally carries several stories
 * and only some are ready for UAT, so the admin picks which ones to draft.
 */
export function groupByStory(cases: SitCase[]): StoryGroup[] {
  const groups = new Map<string, SitCase[]>();
  for (const c of cases) {
    const key = c.story || c.module || 'UNGROUPED';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  return [...groups.entries()].map(([key, items]) => {
    const countries = [...new Set(items.flatMap((i) => i.countries))];
    const priority = items
      .map((i) => i.priority)
      .reduce<TaskPriorityValue>(
        (a, b) => (PRIORITY_RANK[b] > PRIORITY_RANK[a] ? b : a),
        'LOW'
      );
    return {
      key,
      story: items[0].story,
      module: items[0].module,
      title: stripCountryPrefix(items[0].module) || key,
      priority,
      caseCount: items.length,
      countries,
      needsCountrySplit: countries.length > 1,
      cases: items
    };
  });
}

/** Render one story group into the Task + TaskStep shape CTT creates. */
export function toDraftTask(group: StoryGroup): DraftTaskShape {
  return {
    jiraTicket: group.story || null,
    title: group.title,
    description: `${group.title} — ${group.caseCount} test case(s) to verify for ${group.key}.`,
    module: group.title || null,
    priority: group.priority,
    status: 'DRAFT',
    // Single value in the schema; several markets means several tasks sharing
    // a taskGroupId, which the admin confirms before creation.
    countryCode: group.countries.length === 1 ? group.countries[0] : null,
    detectedCountries: group.countries,
    needsCountrySplit: group.needsCountrySplit,
    steps: group.cases.map((c, i) => {
      const description = [
        c.name,
        c.description ? `\n${c.description}` : '',
        c.preconditions ? `\n\nPreconditions:\n${c.preconditions}` : '',
        c.actions.length
          ? `\n\nSteps:\n${c.actions.map((a, n) => `${n + 1}. ${a}`).join('\n')}`
          : ''
      ].join('').trim();

      return {
        order: i + 1,
        description,
        expectedResult: c.expected.map((e) => `- ${e}`).join('\n'),
        // Test data is a QA run artifact (their SO numbers, market markers),
        // not input for UAT — the tester works from steps and expected result.
        testData: null,
        actualResult: null,
        sourceRow: c.sourceRow
      };
    })
  };
}
