import * as XLSX from 'xlsx';
import fs from 'fs';

/** One row of a lseg-testgen workbook (Test Case ID, Title, Preconditions, Test Steps, Test Data, Expected Result, Priority). */
export interface LsegExcelTestCase {
  id: string;
  title: string;
  preconditions: string;
  steps: string[];
  testData: string;
  expectedResult: string;
  priority: string;
}

export function loadExcelTestCases(filePath: string): LsegExcelTestCase[] {
  if (!fs.existsSync(filePath)) return [];
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][];
  const cell = (r: unknown[], i: number) => String(r[i] ?? '').trim();

  return rows
    .slice(1)
    .filter((r) => cell(r, 0) !== '')
    .map((r) => ({
      id: cell(r, 0),
      title: cell(r, 1),
      preconditions: cell(r, 2),
      steps: cell(r, 3).split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      testData: cell(r, 4),
      expectedResult: cell(r, 5),
      priority: cell(r, 6),
    }));
}
