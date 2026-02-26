'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Check, FileSpreadsheet, UploadCloud } from 'lucide-react';
import { CountryConfig, Priority, Task, TestStep } from '../types';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass, textareaBaseClass } from '../components/ui/formClasses';
import { notify } from '../lib/notify';

type ImportWizardProps = {
  tasks: Task[];
  availableCountries: CountryConfig[];
  availableModules: string[];
  onTasksImported: (updatedTasks: Task[]) => void;
  onOpenTask: (taskId: string) => void;
};

type ParsedRow = Record<string, string>;
type PreviewStep = Pick<TestStep, 'id' | 'order' | 'description' | 'expectedResult' | 'actualResult' | 'testData'>;
type ImportMode = 'existing' | 'new';

function parseCsv(text: string): ParsedRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(cell);
      const hasContent = row.some((value) => value.trim().length > 0);
      if (hasContent) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) {
    rows.push(row);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map((header) => header.trim());
  const dataRows: ParsedRow[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const values = rows[r];
    const parsed: ParsedRow = {};
    headers.forEach((header, index) => {
      parsed[header] = values[index] ?? '';
    });
    dataRows.push(parsed);
  }

  return dataRows;
}

const defaultNewTaskForm = {
  title: '',
  description: '',
  countryCode: '',
  module: '',
  priority: Priority.MEDIUM,
  dueDate: ''
};

export const ImportWizard: React.FC<ImportWizardProps> = ({
  tasks,
  availableCountries,
  availableModules,
  onTasksImported,
  onOpenTask
}) => {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<ImportMode>('existing');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [newTaskForm, setNewTaskForm] = useState(defaultNewTaskForm);
  const [columnMap, setColumnMap] = useState({
    description: '',
    expectedResult: '',
    actualResult: '',
    testData: ''
  });
  const [previewSteps, setPreviewSteps] = useState<PreviewStep[]>([]);
  const [importing, setImporting] = useState(false);
  const [lastImportedTaskId, setLastImportedTaskId] = useState<string | null>(null);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) || null, [selectedTaskId, tasks]);

  const mappedSteps = useMemo(() => {
    if (!columnMap.description || !columnMap.expectedResult) return [] as PreviewStep[];
    return rows
      .map((row, index) => ({
        id: `preview-${index + 1}`,
        order: index + 1,
        description: row[columnMap.description] || '',
        expectedResult: row[columnMap.expectedResult] || '',
        actualResult: columnMap.actualResult ? row[columnMap.actualResult] || '' : '',
        testData: columnMap.testData ? row[columnMap.testData] || '' : ''
      }))
      .filter((item) => item.description.trim() || item.expectedResult.trim());
  }, [rows, columnMap]);

  useEffect(() => {
    setPreviewSteps(mappedSteps);
  }, [mappedSteps]);

  useEffect(() => {
    setNewTaskForm((prev) => ({
      ...prev,
      countryCode: prev.countryCode || availableCountries[0]?.code || '',
      module: prev.module || availableModules[0] || 'Ordering'
    }));
  }, [availableCountries, availableModules]);

  const invalidRows = previewSteps.filter(
    (row) => !row.description.trim() || !row.expectedResult.trim()
  ).length;

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

  const updatePreviewStep = (id: string, field: keyof PreviewStep, value: string) => {
    setPreviewSteps((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const resetWizard = () => {
    setStep(1);
    setFileName('');
    setRows([]);
    setHeaders([]);
    setSelectedTaskId('');
    setColumnMap({
      description: '',
      expectedResult: '',
      actualResult: '',
      testData: ''
    });
    setPreviewSteps([]);
    setImportMode('existing');
    setNewTaskForm(defaultNewTaskForm);
    setLastImportedTaskId(null);
  };

  const importToExistingTask = async (): Promise<{ ok: boolean; taskId?: string }> => {
    if (!selectedTaskId || !selectedTask) {
      notify('Please select a target task.', 'error');
      return { ok: false };
    }

    const confirmed = window.confirm(
      `Replace all existing steps in "${selectedTask.title}" with ${previewSteps.length} imported steps?`
    );
    if (!confirmed) return { ok: false };

    const response = await fetch(`/api/tasks/${selectedTaskId}/steps/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        steps: previewSteps.map((item) => ({
          description: item.description.trim(),
          expectedResult: item.expectedResult.trim(),
          actualResult: item.actualResult?.trim() || '',
          testData: item.testData?.trim() || ''
        }))
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      notify(data?.error || 'Failed to import steps', 'error');
      return { ok: false };
    }
    onTasksImported([data]);
    return { ok: true, taskId: data?.id };
  };

  const importAsNewTask = async (): Promise<{ ok: boolean; taskId?: string }> => {
    const title = newTaskForm.title.trim();
    if (!title) {
      notify('New task title is required.', 'error');
      return { ok: false };
    }
    if (!newTaskForm.countryCode) {
      notify('Select country for the new task.', 'error');
      return { ok: false };
    }
    if (!newTaskForm.module) {
      notify('Select module for the new task.', 'error');
      return { ok: false };
    }

    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: newTaskForm.description.trim(),
        module: newTaskForm.module,
        priority: newTaskForm.priority.toUpperCase(),
        dueDate: newTaskForm.dueDate || null,
        countries: [newTaskForm.countryCode],
        steps: previewSteps.map((item) => ({
          description: item.description.trim(),
          expectedResult: item.expectedResult.trim(),
          actualResult: item.actualResult?.trim() || '',
          testData: item.testData?.trim() || '',
          countryFilter: 'ALL'
        }))
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      notify(data?.error || 'Failed to create task from import', 'error');
      return { ok: false };
    }

    const createdTasks = Array.isArray(data) ? data : [];
    if (createdTasks.length === 0) {
      notify('Import succeeded but no task was returned by API.', 'error');
      return { ok: false };
    }
    onTasksImported(createdTasks);
    return { ok: true, taskId: createdTasks[0]?.id };
  };

  const handleImport = async () => {
    if (!columnMap.description || !columnMap.expectedResult) {
      notify('Map description and expected result columns.', 'error');
      return;
    }
    if (previewSteps.length === 0) {
      notify('No steps to import.', 'error');
      return;
    }
    if (invalidRows > 0) {
      notify('Fix missing fields in preview before import.', 'error');
      return;
    }

    setImporting(true);
    try {
      let result: { ok: boolean; taskId?: string };
      if (importMode === 'existing') {
        result = await importToExistingTask();
      } else {
        result = await importAsNewTask();
      }
      if (!result.ok) return;
      setLastImportedTaskId(result.taskId ?? null);
      notify('Import completed successfully.', 'success');
      setStep(3);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Import Test Steps</h1>
        <p className="text-slate-500">
          Upload CSV (Excel export), map columns, adjust preview, then import to an existing task or create a new task.
        </p>
      </div>

      <div className="grid grid-cols-3 mb-10 relative">
        <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-200 -z-10" />
        {[
          { value: 1, label: 'Upload File' },
          { value: 2, label: 'Map & Preview' },
          { value: 3, label: 'Done' }
        ].map((item) => (
          <div key={item.value} className="flex flex-col items-center gap-2">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= item.value ? 'bg-slate-900 text-white' : 'bg-white border-2 border-slate-200 text-slate-400'
              }`}
            >
              {step > item.value ? <Check size={14} /> : item.value}
            </div>
            <span className={`text-xs font-medium ${step >= item.value ? 'text-slate-700' : 'text-slate-400'}`}>
              {item.label}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[440px] flex flex-col">
        {step === 1 && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
            <label className="w-full max-w-xl h-56 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-slate-400 transition-colors">
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
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Import Mode</label>
                <select
                  value={importMode}
                  onChange={(event) => setImportMode(event.target.value as ImportMode)}
                  className={selectBaseClass}
                >
                  <option value="existing">Replace steps in existing task</option>
                  <option value="new">Create new task with imported steps</option>
                </select>
              </div>
              {importMode === 'existing' ? (
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
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Country</label>
                    <select
                      value={newTaskForm.countryCode}
                      onChange={(event) => setNewTaskForm((prev) => ({ ...prev, countryCode: event.target.value }))}
                      className={selectBaseClass}
                    >
                      {availableCountries.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.code} - {country.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Module</label>
                    <select
                      value={newTaskForm.module}
                      onChange={(event) => setNewTaskForm((prev) => ({ ...prev, module: event.target.value }))}
                      className={selectBaseClass}
                    >
                      {availableModules.map((module) => (
                        <option key={module} value={module}>
                          {module}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

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

            {importMode === 'new' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">New Task Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Title</label>
                    <input
                      value={newTaskForm.title}
                      onChange={(event) => setNewTaskForm((prev) => ({ ...prev, title: event.target.value }))}
                      className={fieldBaseClass}
                      placeholder="Task title"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Priority</label>
                    <select
                      value={newTaskForm.priority}
                      onChange={(event) =>
                        setNewTaskForm((prev) => ({ ...prev, priority: event.target.value as Priority }))
                      }
                      className={selectBaseClass}
                    >
                      <option value={Priority.HIGH}>High</option>
                      <option value={Priority.MEDIUM}>Medium</option>
                      <option value={Priority.LOW}>Low</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Description (optional)</label>
                    <textarea
                      value={newTaskForm.description}
                      onChange={(event) => setNewTaskForm((prev) => ({ ...prev, description: event.target.value }))}
                      className={textareaBaseClass}
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-3 text-left font-medium w-14">#</th>
                    <th className="p-3 text-left font-medium">Description</th>
                    <th className="p-3 text-left font-medium">Expected Result</th>
                    <th className="p-3 text-left font-medium">Test Data</th>
                    <th className="p-3 text-left font-medium">Actual Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewSteps.slice(0, 30).map((row) => {
                    const invalid = !row.description.trim() || !row.expectedResult.trim();
                    return (
                      <tr key={row.id} className={invalid ? 'bg-rose-50/60' : ''}>
                        <td className="p-3 align-top">{row.order}</td>
                        <td className="p-2">
                          <textarea
                            value={row.description}
                            onChange={(event) => updatePreviewStep(row.id, 'description', event.target.value)}
                            className={textareaBaseClass}
                            rows={2}
                            placeholder="Step description (supports multiline)"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            value={row.expectedResult}
                            onChange={(event) => updatePreviewStep(row.id, 'expectedResult', event.target.value)}
                            className={textareaBaseClass}
                            rows={2}
                            placeholder="Expected result (supports multiline)"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            value={row.testData || ''}
                            onChange={(event) => updatePreviewStep(row.id, 'testData', event.target.value)}
                            className={textareaBaseClass}
                            rows={2}
                            placeholder="Optional multiline"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            value={row.actualResult || ''}
                            onChange={(event) => updatePreviewStep(row.id, 'actualResult', event.target.value)}
                            className={textareaBaseClass}
                            rows={2}
                            placeholder="Optional multiline"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {invalidRows > 0 && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex items-center gap-2">
                <AlertCircle size={14} /> {invalidRows} row(s) still have missing required fields.
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
              {importMode === 'existing'
                ? 'Task steps were replaced successfully.'
                : 'New task was created successfully from imported steps.'}
            </p>
            {lastImportedTaskId && (
              <button
                onClick={() => onOpenTask(lastImportedTaskId)}
                className={`${subtleButtonClass} mt-5`}
              >
                Open Task Detail
              </button>
            )}
          </div>
        )}

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          {step === 2 && (
            <button onClick={() => setStep(1)} className={subtleButtonClass}>
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
            <button onClick={resetWizard} className={primaryButtonClass}>
              Import Another File
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
