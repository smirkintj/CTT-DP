import ExcelJS from 'exceljs';
import { resolveSheet } from './sitWorkbook';

export type SitTestRow = {
  testCaseId: string;
  title: string;
  steps: Array<{ action: string; expected: string }>;
  result: string;
  /** Jira story this case belongs to; '' when the sheet has no such column. */
  story: string;
};

/**
 * Parse a SIT Excel file (Buffer) into structured test case rows.
 * Expects columns (case-insensitive): Test Case ID, Title/Name, Steps, Expected Result, Status.
 * Skips blank rows and the header row.
 *
 * Uses exceljs (no prototype-pollution CVEs) instead of xlsx.
 */
export async function parseExcel(buffer: Buffer): Promise<SitTestRow[]> {
  const workbook = new ExcelJS.Workbook();
  // exceljs declares its own Buffer interface that structurally differs from
  // Node's; the value passed is a real Node Buffer, which it accepts at runtime.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const normalize = (val: ExcelJS.CellValue): string => {
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
  };

  // These workbooks lead with a "Guideline" cover sheet, so worksheet 1 is
  // metadata rather than test cases. Resolve by header signature instead —
  // the same resolver the import wizard uses, so the two cannot diverge.
  const asRows = (ws: ExcelJS.Worksheet): string[][] => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push((values as ExcelJS.CellValue[]).map(normalize));
    });
    return rows;
  };

  const resolved = resolveSheet(
    workbook.worksheets.map((ws) => ({ name: ws.name, rows: asRows(ws) }))
  );
  const sheet = resolved
    ? workbook.worksheets.find((ws) => ws.name === resolved.name)
    : workbook.worksheets[0];
  if (!sheet) return [];

  // Header row is wherever the signature matched, not always row 1.
  const headerRowNumber = (resolved?.headerRow ?? 0) + 1;

  // Read header row (row 1) to build column index map
  const headerRow = sheet.getRow(headerRowNumber);
  const headers: Record<string, number> = {};
  headerRow.eachCell((cell, colNumber) => {
    headers[normalize(cell.value).toLowerCase()] = colNumber;
  });

  const findCol = (variants: string[]): number => {
    for (const v of variants) {
      const match = Object.keys(headers).find((h) => h.includes(v.toLowerCase()));
      if (match) return headers[match];
    }
    return 0;
  };

  const idCol = findCol(['test case id', 'id', 'case id', 'tc id', 'no']);
  const titleCol = findCol(['title', 'name', 'test name', 'scenario']);
  const stepsCol = findCol(['step', 'action', 'test step']);
  const expectedCol = findCol(['expected result', 'expected outcome', 'expected']);
  const resultCol = findCol(['status', 'outcome', 'pass', 'fail', 'result']);
  // A sprint sheet covers several stories; the caller filters to the ticket
  // it is drafting so one story's draft cannot absorb another's test cases.
  const storyCol = findCol(['user story id (jira)', 'user story id', 'jira', 'ticket']);

  const result: SitTestRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return; // skip cover rows and the header

    const id = idCol ? normalize(row.getCell(idCol).value) : '';
    const title = titleCol ? normalize(row.getCell(titleCol).value) : '';
    const stepText = stepsCol ? normalize(row.getCell(stepsCol).value) : '';
    const expectedText = expectedCol ? normalize(row.getCell(expectedCol).value) : '';
    const resultText = resultCol ? normalize(row.getCell(resultCol).value) : '';
    const storyText = storyCol ? normalize(row.getCell(storyCol).value) : '';

    if (!title && !stepText) return; // skip blank rows

    result.push({
      testCaseId: id || `TC-${result.length + 1}`,
      title: title || stepText.slice(0, 80),
      steps: stepText ? [{ action: stepText, expected: expectedText }] : [],
      result: resultText,
      story: storyText,
    });
  });

  return result;
}
