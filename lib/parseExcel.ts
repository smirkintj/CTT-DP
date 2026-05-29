import * as XLSX from 'xlsx';

export type SitTestRow = {
  testCaseId: string;
  title: string;
  steps: Array<{ action: string; expected: string }>;
  result: string;
};

/**
 * Parse a SIT Excel file (Buffer) into structured test case rows.
 * Expects columns (case-insensitive): Test Case ID, Title/Name, Steps, Expected Result, Result/Status.
 * Skips blank rows and the header row.
 */
export function parseExcel(buffer: Buffer): SitTestRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const normalize = (val: unknown): string => String(val ?? '').trim();

  // Flexible column name resolution — match common variants case-insensitively
  const findKey = (row: Record<string, unknown>, variants: string[]): string => {
    const keys = Object.keys(row).map((k) => k.trim().toLowerCase());
    for (const v of variants) {
      const idx = keys.findIndex((k) => k.includes(v.toLowerCase()));
      if (idx !== -1) return Object.keys(row)[idx];
    }
    return '';
  };

  const result: SitTestRow[] = [];

  for (const row of rows) {
    const idKey = findKey(row, ['test case id', 'id', 'case id', 'tc id', 'no']);
    const titleKey = findKey(row, ['title', 'name', 'test name', 'scenario', 'description']);
    const stepsKey = findKey(row, ['step', 'action', 'test step']);
    const expectedKey = findKey(row, ['expected', 'expected result', 'expected outcome']);
    const resultKey = findKey(row, ['result', 'status', 'outcome', 'pass', 'fail']);

    const id = normalize(row[idKey]);
    const title = normalize(row[titleKey]);
    const stepText = normalize(row[stepsKey]);
    const expectedText = normalize(row[expectedKey]);
    const resultText = normalize(row[resultKey]);

    // Skip empty rows
    if (!title && !stepText) continue;

    result.push({
      testCaseId: id || `TC-${result.length + 1}`,
      title: title || stepText.slice(0, 80),
      steps: stepText ? [{ action: stepText, expected: expectedText }] : [],
      result: resultText,
    });
  }

  return result;
}
