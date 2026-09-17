/**
 * Server-side workbook reading for the Jira intake pipeline.
 *
 * exceljs lives here rather than in lib/sitWorkbook.ts so the shared parsing
 * stays free of node-only dependencies and the import wizard can use it in the
 * browser. All header matching, sheet resolution and case parsing comes from
 * that shared module, so the cron and the wizard read a workbook identically —
 * they previously had separate implementations, which is why the
 * wrong-worksheet bug had to be fixed twice.
 */
import ExcelJS from 'exceljs';
import {
  buildHeaderIndex,
  groupByStory,
  readCases,
  resolveSheet,
  type SitCase,
  type StoryGroup
} from './sitWorkbook';

/** exceljs cell values into plain text, including rich text and formulas. */
function normalize(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === 'object') {
    const obj = val as unknown as Record<string, unknown>;
    // Rich text: concatenate the runs. Note this is `richText`, not `text` —
    // `text` belongs to hyperlink cells, handled below.
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text?: string }>)
        .map((run) => run.text ?? '')
        .join('')
        .trim();
    }
    if ('result' in obj) return String(obj.result ?? '').trim();
    if ('text' in obj) return String(obj.text ?? '').trim();
    if ('error' in obj) return '';
    return '';
  }
  return String(val).trim();
}

function sheetToGrid(ws: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    // row.values is 1-indexed with a leading hole.
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    rows.push((values as ExcelJS.CellValue[]).map(normalize));
  });
  return rows;
}

/** Every test case in the workbook, from whichever sheet actually holds them. */
export async function readWorkbookCases(buffer: Buffer): Promise<SitCase[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs declares its own Buffer interface that structurally differs from
  // Node's; the value passed is a real Node Buffer, which it accepts at runtime.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheets = workbook.worksheets.map((ws) => ({ name: ws.name, rows: sheetToGrid(ws) }));
  // These workbooks lead with a "Guideline" cover sheet, so worksheet 1 is
  // metadata rather than test cases.
  const resolved = resolveSheet(sheets);
  if (!resolved) return [];

  const idx = buildHeaderIndex(resolved.rows[resolved.headerRow] ?? []);
  return readCases(resolved, idx);
}

/** The same cases grouped by Jira story, which is how a task is scoped. */
export async function readWorkbookStories(buffer: Buffer): Promise<StoryGroup[]> {
  const cases = await readWorkbookCases(buffer);
  return cases.length === 0 ? [] : groupByStory(cases);
}
