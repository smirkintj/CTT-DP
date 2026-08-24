import ExcelJS from 'exceljs';

export type SitTestRow = {
  testCaseId: string;
  title: string;
  steps: Array<{ action: string; expected: string }>;
  result: string;
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

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

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

  // Read header row (row 1) to build column index map
  const headerRow = sheet.getRow(1);
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

  const result: SitTestRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const id = idCol ? normalize(row.getCell(idCol).value) : '';
    const title = titleCol ? normalize(row.getCell(titleCol).value) : '';
    const stepText = stepsCol ? normalize(row.getCell(stepsCol).value) : '';
    const expectedText = expectedCol ? normalize(row.getCell(expectedCol).value) : '';
    const resultText = resultCol ? normalize(row.getCell(resultCol).value) : '';

    if (!title && !stepText) return; // skip blank rows

    result.push({
      testCaseId: id || `TC-${result.length + 1}`,
      title: title || stepText.slice(0, 80),
      steps: stepText ? [{ action: stepText, expected: expectedText }] : [],
      result: resultText,
    });
  });

  return result;
}
