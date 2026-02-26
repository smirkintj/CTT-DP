'use client';

import React, { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Check, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { Task, TestStep } from '../types';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass } from '../components/ui/formClasses';
import { notify } from '../lib/notify';

type ImportWizardProps = {
  tasks: Task[];
  onTasksImported: (updatedTasks: Task[]) => void;
};

type ParsedRow = Record<string, string>;

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i]);
    const row: ParsedRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({ tasks, onTasksImported }) => {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [columnMap, setColumnMap] = useState({
    description: '',
    expectedResult: '',
    actualResult: '',
    testData: ''
  });
  const [importing, setImporting] = useState(false);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) || null, [selectedTaskId, tasks]);

  const mappedSteps = useMemo(() => {
    if (!columnMap.description || !columnMap.expectedResult) return [] as TestStep[];
    return rows
      .map((row, index) => ({
        id: `preview-${index + 1}`,
        order: index + 1,
        description: (row[columnMap.description] || '').trim(),
        expectedResult: (row[columnMap.expectedResult] || '').trim(),
        actualResult: columnMap.actualResult ? (row[columnMap.actualResult] || '').trim() : '',
        testData: columnMap.testData ? (row[columnMap.testData] || '').trim() : '',
        comments: []
      }))
      .filter((step) => step.description || step.expectedResult);
  }, [rows, columnMap]);

  const invalidRows = mappedSteps.filter((step) => !step.description || !step.expectedResult).length;

  const onSelectFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      notify('Please upload CSV file (export from Excel).', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('File too large (max 5MB).', 'error');
      return;
    }

    const text = await file.text();
    const parsedRows = parseCsv(text);
    if (parsedRows.length === 0) {
      notify('No usable rows found in CSV.', 'error');
      return;
    }
    const nextHeaders = Object.keys(parsedRows[0] || {});
    setRows(parsedRows);
    setHeaders(nextHeaders);
    setFileName(file.name);
    setColumnMap({
      description: nextHeaders[0] || '',
      expectedResult: nextHeaders[1] || '',
      actualResult: '',
      testData: ''
    });
    setStep(2);
  };

  const handleImport = async () => {
    if (!selectedTaskId || !selectedTask) {
      notify('Please select a task.', 'error');
      return;
    }
    if (!columnMap.description || !columnMap.expectedResult) {
      notify('Map description and expected result columns.', 'error');
      return;
    }
    if (mappedSteps.length === 0) {
      notify('No steps to import.', 'error');
      return;
    }
    if (invalidRows > 0) {
      notify('Fix invalid rows before importing.', 'error');
      return;
    }

    const confirmed = window.confirm(
      `Replace all existing steps in "${selectedTask.title}" with ${mappedSteps.length} imported steps?`
    );
    if (!confirmed) return;

    setImporting(true);
    try {
      const response = await fetch(`/api/tasks/${selectedTaskId}/steps/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: mappedSteps.map((step) => ({
            description: step.description,
            expectedResult: step.expectedResult,
            actualResult: step.actualResult || '',
            testData: step.testData || ''
          }))
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        notify(data?.error || 'Failed to import steps', 'error');
        return;
      }

      onTasksImported([data]);
      notify('Steps imported successfully.', 'success');
      setStep(3);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Import Test Steps</h1>
        <p className="text-slate-500">
          Upload CSV (Excel export), map columns, preview rows, then replace steps in a selected task.
        </p>
      </div>

      <div className="flex items-center justify-between mb-10 relative">
        <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-200 -z-10" />
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step >= s ? 'bg-slate-900 text-white' : 'bg-white border-2 border-slate-200 text-slate-400'
            }`}
          >
            {step > s ? <Check size={14} /> : s}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[420px] flex flex-col">
        {step === 1 && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <label className="w-full max-w-lg h-56 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors">
              <UploadCloud size={26} className="text-slate-500 mb-4" />
              <p className="text-slate-900 font-medium">Click to upload CSV exported from Excel</p>
              <p className="text-slate-500 text-sm mt-1">.csv only, max 5MB</p>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => onSelectFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 p-6 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-700 text-sm font-medium">
                <FileSpreadsheet size={16} />
                {fileName || 'CSV loaded'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Target Task</label>
                <select
                  value={selectedTaskId}
                  onChange={(event) => setSelectedTaskId(event.target.value)}
                  className={selectBaseClass}
                >
                  <option value="">Select task</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title} ({task.countryCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Description Column</label>
                <select
                  value={columnMap.description}
                  onChange={(event) => setColumnMap((prev) => ({ ...prev, description: event.target.value }))}
                  className={selectBaseClass}
                >
                  <option value="">Select column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Expected Result Column</label>
                <select
                  value={columnMap.expectedResult}
                  onChange={(event) => setColumnMap((prev) => ({ ...prev, expectedResult: event.target.value }))}
                  className={selectBaseClass}
                >
                  <option value="">Select column</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Actual Result Column (optional)</label>
                <select
                  value={columnMap.actualResult}
                  onChange={(event) => setColumnMap((prev) => ({ ...prev, actualResult: event.target.value }))}
                  className={selectBaseClass}
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Test Data Column (optional)</label>
                <select
                  value={columnMap.testData}
                  onChange={(event) => setColumnMap((prev) => ({ ...prev, testData: event.target.value }))}
                  className={selectBaseClass}
                >
                  <option value="">Not mapped</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3 text-left font-medium">#</th>
                    <th className="p-3 text-left font-medium">Description</th>
                    <th className="p-3 text-left font-medium">Expected Result</th>
                    <th className="p-3 text-left font-medium">Test Data</th>
                    <th className="p-3 text-left font-medium">Actual Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappedSteps.slice(0, 25).map((row) => {
                    const invalid = !row.description || !row.expectedResult;
                    return (
                      <tr key={row.id} className={invalid ? 'bg-rose-50/60' : ''}>
                        <td className="p-3">{row.order}</td>
                        <td className="p-3">{row.description || <span className="text-rose-600">Missing</span>}</td>
                        <td className="p-3">{row.expectedResult || <span className="text-rose-600">Missing</span>}</td>
                        <td className="p-3">{row.testData || '—'}</td>
                        <td className="p-3">{row.actualResult || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {invalidRows > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex items-center gap-2">
                <AlertCircle size={14} /> {invalidRows} row(s) are missing required fields.
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4">
              <Check size={28} />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Import Completed</h2>
            <p className="text-slate-500 mt-2 max-w-md">
              Steps were replaced successfully for <strong>{selectedTask?.title || 'selected task'}</strong>.
            </p>
          </div>
        )}

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          {step === 2 && (
            <button
              onClick={() => setStep(1)}
              className={subtleButtonClass}
            >
              Back
            </button>
          )}
          {step === 2 && (
            <button onClick={handleImport} disabled={importing} className={primaryButtonClass}>
              <span className="inline-flex items-center gap-2">
                {importing ? 'Importing...' : 'Confirm Import'}
                {!importing && <ArrowRight size={14} />}
              </span>
            </button>
          )}
          {step === 3 && (
            <button
              onClick={() => {
                setStep(1);
                setRows([]);
                setHeaders([]);
                setFileName('');
              }}
              className={primaryButtonClass}
            >
              Import Another File
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
