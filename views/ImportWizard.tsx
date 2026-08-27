'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Bot, Check, FileSpreadsheet, Lightbulb, Loader2, UploadCloud } from 'lucide-react';
import { CountryConfig, Priority, Task, TestStep } from '../types';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass, textareaBaseClass } from '../components/ui/formClasses';
import { notify } from '../lib/notify';
import { isValidDueDate } from '../lib/taskValidation';
import { detectCountries, resolveSheet, stripCountryPrefix } from '../lib/sitWorkbook';

type ParsedRow = Record<string, string>;
type PreviewStep = Pick<TestStep, 'id' | 'order' | 'description' | 'expectedResult' | 'actualResult' | 'testData'>;
type ImportMode = 'existing' | 'new';

type AiInsights = {
  summary: string;
  insights: string[];
};

type StoryOption = {
  key: string;
  title: string;
  caseCount: number;
  countries: string[];
};

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

async function parseExcel(file: File): Promise<{ rows: ParsedRow[]; sheetName: string }> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  // QA workbooks lead with a "Guideline" cover sheet, so the first sheet is the
  // wrong default — resolve by header signature and fall back to sheet 1 only
  // for simple single-sheet exports.
  const sheets = wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], {
      header: 1,
      defval: ''
    }) as string[][]
  }));

  const resolved = resolveSheet(sheets);
  const chosen = resolved ?? (sheets[0] ? { ...sheets[0], headerRow: 0 } : null);
  if (!chosen) return { rows: [], sheetName: '' };

  const raw = chosen.rows.slice(chosen.headerRow);
  if (raw.length < 2) return { rows: [], sheetName: chosen.name };

  const headers = (raw[0] as string[]).map((h) => String(h ?? '').trim());
  const dataRows: ParsedRow[] = [];
  for (let r = 1; r < raw.length; r += 1) {
    const values = raw[r] as string[];
    const parsed: ParsedRow = {};
    let hasContent = false;
    headers.forEach((header, index) => {
      const val = String(values[index] ?? '').trim();
      parsed[header] = val;
      if (val) hasContent = true;
    });
    if (hasContent) dataRows.push(parsed);
  }
  return { rows: dataRows, sheetName: chosen.name };
}

/** Header in the parsed rows that carries the Jira story key, if any. */
const STORY_HEADER_ALIASES = ['user story id (jira)', 'user story id', 'jira', 'jira id', 'ticket'];

function findStoryHeader(headers: string[]): string | null {
  const match = headers.find((h) =>
    STORY_HEADER_ALIASES.includes(h.trim().toLowerCase().replace(/\s+/g, ' '))
  );
  return match ?? null;
}

/**
 * A sprint sheet normally carries several Jira stories and only some are ready
 * for UAT, so the admin picks which ones to draft rather than importing whole.
 */
function buildStories(rows: ParsedRow[], storyHeader: string | null): StoryOption[] {
  if (!storyHeader) return [];
  const order: string[] = [];
  const byKey = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    const key = (row[storyHeader] || '').trim() || 'Ungrouped';
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)!.push(row);
  }
  return order.map((key) => {
    const items = byKey.get(key)!;
    const moduleHeader = Object.keys(items[0]).find(
      (h) => h.trim().toLowerCase() === 'module'
    );
    const countries = detectCountries(
      ...items.map((i) => (moduleHeader ? i[moduleHeader] : '')),
      ...items.map((i) => i['Test Data'] ?? '')
    );
    return {
      key,
      title: stripCountryPrefix(moduleHeader ? items[0][moduleHeader] : '') || key,
      caseCount: items.length,
      countries
    };
  });
}

const defaultNewTaskForm = {
  title: '',
  description: '',
  countryCodes: [] as string[],
  module: '',
  priority: Priority.MEDIUM,
  dueDate: ''
};

export const ImportWizard: React.FC = () => {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [availableCountries, setAvailableCountries] = useState<CountryConfig[]>([]);
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/tasks', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setTasks(data as Task[]); })
      .catch(() => {});
    Promise.all([
      fetch('/api/admin/countries').then((r) => r.ok ? r.json() : []),
      fetch('/api/admin/modules').then((r) => r.ok ? r.json() : []),
      fetch('/api/admin/ai-settings').then((r) => r.ok ? r.json() : null)
    ]).then(([c, m, ai]) => {
      if (Array.isArray(c)) setAvailableCountries(c);
      if (Array.isArray(m)) setAvailableModules(m);
      if (ai && ai.provider !== 'none' && ai.apiKeySet) setAiEnabled(true);
    }).catch(() => {});
  }, []);

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
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [storyHeader, setStoryHeader] = useState<string | null>(null);
  const [stories, setStories] = useState<StoryOption[]>([]);
  const [selectedStories, setSelectedStories] = useState<string[]>([]);

  // Everything downstream — mapping, preview, AI, import — runs on the stories
  // the admin selected, not the whole sheet.
  const activeRows = useMemo(() => {
    if (!storyHeader || selectedStories.length === 0) return rows;
    return rows.filter((row) =>
      selectedStories.includes((row[storyHeader] || '').trim() || 'Ungrouped')
    );
  }, [rows, storyHeader, selectedStories]);

  const toggleStory = (key: string) => {
    setSelectedStories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setAiInsights(null);
  };

  const toggleMarket = (code: string) => {
    setNewTaskForm((prev) => ({
      ...prev,
      countryCodes: prev.countryCodes.includes(code)
        ? prev.countryCodes.filter((c) => c !== code)
        : [...prev.countryCodes, code]
    }));
  };

  /** Markets the selected stories were tested against, as a starting point. */
  const suggestedMarkets = useMemo(() => {
    const known = new Set(availableCountries.map((c) => c.code));
    return [
      ...new Set(
        stories
          .filter((s) => selectedStories.includes(s.key))
          .flatMap((s) => s.countries)
          .filter((c) => known.has(c))
      )
    ];
  }, [stories, selectedStories, availableCountries]);

  // Pre-tick the detected markets so the common case needs no clicks; the admin
  // can still change them before creating.
  useEffect(() => {
    if (suggestedMarkets.length === 0) return;
    setNewTaskForm((prev) =>
      prev.countryCodes.length === 0 ? { ...prev, countryCodes: suggestedMarkets } : prev
    );
  }, [suggestedMarkets]);

  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) || null, [selectedTaskId, tasks]);

  const mappedSteps = useMemo(() => {
    if (!columnMap.description || !columnMap.expectedResult) return [] as PreviewStep[];
    return activeRows
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
      countryCodes: prev.countryCodes,
      module: prev.module || availableModules[0] || 'Ordering'
    }));
  }, [availableCountries, availableModules]);

  const invalidRows = previewSteps.filter(
    (row) => !row.description.trim() || !row.expectedResult.trim()
  ).length;

  const onSelectFile = async (file?: File | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
    const isCsv = name.endsWith('.csv');
    if (!isExcel && !isCsv) {
      notify('Please upload a .csv or .xlsx file.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      notify('File too large (max 10MB).', 'error');
      return;
    }

    let parsedRows: ParsedRow[];
    let parsedSheet = '';
    if (isExcel) {
      const parsed = await parseExcel(file);
      parsedRows = parsed.rows;
      parsedSheet = parsed.sheetName;
    } else {
      const text = await file.text();
      parsedRows = parseCsv(text);
    }

    if (parsedRows.length === 0) {
      notify('No usable rows found in file.', 'error');
      return;
    }

    const nextHeaders = Object.keys(parsedRows[0] || {});
    const nextStoryHeader = findStoryHeader(nextHeaders);
    const nextStories = buildStories(parsedRows, nextStoryHeader);

    setRows(parsedRows);
    setHeaders(nextHeaders);
    setFileName(file.name);
    setSheetName(parsedSheet);
    setStoryHeader(nextStoryHeader);
    setStories(nextStories);
    // Start with everything selected so a single-story sheet needs no clicks.
    setSelectedStories(nextStories.map((s) => s.key));
    setAiInsights(null);

    const pick = (...names: string[]) =>
      nextHeaders.find((h) => names.includes(h.trim().toLowerCase())) || '';
    setColumnMap({
      description: pick('steps', 'test steps', 'description') || nextHeaders[0] || '',
      expectedResult: pick('expected result', 'expected') || nextHeaders[1] || '',
      actualResult: '',
      testData: pick('test data') || ''
    });
    setStep(2);
  };

  const runAiAssist = async () => {
    if (stories.length > 0 && selectedStories.length === 0) {
      notify('Select at least one story for the AI to analyse.', 'error');
      return;
    }
    setAiLoading(true);
    setAiInsights(null);
    try {
      const context: Record<string, string> = {};
      if (importMode === 'existing' && selectedTask) {
        context.taskTitle = selectedTask.title;
      }
      if (newTaskForm.countryCodes.length) context.countryCode = newTaskForm.countryCodes.join(', ');
      if (selectedStories.length) context.stories = selectedStories.join(', ');

      const res = await fetch('/api/import/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers,
          // Only the selected stories are sent — the AI never sees rows the
          // admin excluded from this import.
          sampleRows: activeRows.slice(0, 10),
          totalRows: activeRows.length,
          ...context
        })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify(data?.error || 'AI analysis failed', 'error');
        return;
      }

      // Apply AI column mapping
      if (data.columnMap) {
        setColumnMap((prev) => ({
          description: data.columnMap.description || prev.description,
          expectedResult: data.columnMap.expectedResult || prev.expectedResult,
          actualResult: data.columnMap.actualResult || prev.actualResult,
          testData: data.columnMap.testData || prev.testData
        }));
      }

      setAiInsights({ summary: data.summary, insights: data.insights });
    } catch {
      notify('AI analysis failed', 'error');
    } finally {
      setAiLoading(false);
    }
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
    setColumnMap({ description: '', expectedResult: '', actualResult: '', testData: '' });
    setPreviewSteps([]);
    setImportMode('existing');
    setNewTaskForm(defaultNewTaskForm);
    setLastImportedTaskId(null);
    setShowReplaceConfirm(false);
    setAiInsights(null);
    setSheetName('');
    setStoryHeader(null);
    setStories([]);
    setSelectedStories([]);
  };

  const importToExistingTask = async (skipConfirm = false): Promise<{ ok: boolean; taskId?: string }> => {
    if (!selectedTaskId || !selectedTask) {
      notify('Please select a target task.', 'error');
      return { ok: false };
    }
    if (!skipConfirm) {
      setShowReplaceConfirm(true);
      return { ok: false };
    }
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
    return { ok: true, taskId: data?.id };
  };

  const importAsNewTask = async (): Promise<{ ok: boolean; taskId?: string }> => {
    const title = newTaskForm.title.trim();
    if (!title) { notify('New task title is required.', 'error'); return { ok: false }; }
    if (title.length > 200) { notify('New task title is too long.', 'error'); return { ok: false }; }
    if (newTaskForm.countryCodes.length === 0) { notify('Select at least one market for the new task.', 'error'); return { ok: false }; }
    if (!newTaskForm.module) { notify('Select module for the new task.', 'error'); return { ok: false }; }
    if (!isValidDueDate(newTaskForm.dueDate || undefined)) { notify('Due date is invalid.', 'error'); return { ok: false }; }

    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: newTaskForm.description.trim(),
        module: newTaskForm.module,
        priority: newTaskForm.priority.toUpperCase(),
        dueDate: newTaskForm.dueDate || null,
        // One task is created per market, sharing a taskGroupId — same
        // behaviour as ticking several markets in manual task creation.
        countries: newTaskForm.countryCodes,
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
    return { ok: true, taskId: createdTasks[0]?.id };
  };

  const handleImport = async () => {
    if (!columnMap.description || !columnMap.expectedResult) {
      notify('Map description and expected result columns.', 'error');
      return;
    }
    if (stories.length > 0 && selectedStories.length === 0) {
      notify('Select at least one story to import.', 'error');
      return;
    }
    if (previewSteps.length === 0) { notify('No steps to import.', 'error'); return; }
    if (invalidRows > 0) { notify('Fix missing fields in preview before import.', 'error'); return; }

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

  const confirmReplaceImport = async () => {
    setShowReplaceConfirm(false);
    setImporting(true);
    try {
      const result = await importToExistingTask(true);
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
          Upload CSV or Excel, map columns, adjust preview, then import to an existing task or create a new one.
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
              <p className="text-slate-900 font-medium">Click to upload a CSV or Excel file</p>
              <p className="text-slate-500 text-sm mt-1">.csv or .xlsx / .xls, max 10MB</p>
              <input
                type="file"
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(event) => onSelectFile(event.target.files?.[0] || null)}
              />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="flex-1 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center gap-2 text-slate-700 text-sm font-medium flex-1">
                <FileSpreadsheet size={16} />
                {fileName || 'File loaded'}
                {sheetName && <span className="text-slate-400 font-normal">· sheet &ldquo;{sheetName}&rdquo;</span>}
                <span className="ml-auto text-slate-400 font-normal">
                  {activeRows.length === rows.length
                    ? `${rows.length} rows`
                    : `${activeRows.length} of ${rows.length} rows`}
                </span>
              </div>
              {aiEnabled && (
                <button
                  onClick={runAiAssist}
                  disabled={aiLoading}
                  className={`ml-3 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                    aiLoading
                      ? 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
                      : 'border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100'
                  }`}
                >
                  {aiLoading ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Bot size={15} />
                  )}
                  {aiLoading ? 'Analysing…' : 'Analyse with AI'}
                </button>
              )}
            </div>

            {/* Story picker — a sprint sheet carries several Jira stories and
                usually only some are ready for UAT. */}
            {stories.length > 1 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      Stories ready for UAT
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pick which stories to analyse and draft. Unselected rows are ignored.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedStories(stories.map((s) => s.key)); setAiInsights(null); }}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    >
                      Select all
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      onClick={() => { setSelectedStories([]); setAiInsights(null); }}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {stories.map((s) => {
                    const checked = selectedStories.includes(s.key);
                    return (
                      <label
                        key={s.key}
                        className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          checked
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStory(s.key)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-slate-900">{s.key}</span>
                            <span className="text-xs text-slate-400">
                              {s.caseCount} case{s.caseCount === 1 ? '' : 's'}
                            </span>
                          </span>
                          <span className="block text-xs text-slate-600 mt-0.5 truncate">{s.title}</span>
                          {s.countries.length > 0 && (
                            <span className="block text-[11px] text-slate-400 mt-1">
                              {s.countries.length > 1
                                ? `${s.countries.length} markets: ${s.countries.join(', ')} — needs one task each`
                                : `Market: ${s.countries[0]}`}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {selectedStories.length === 0 && (
                  <p className="text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertCircle size={13} /> Nothing selected — choose at least one story to continue.
                  </p>
                )}
              </div>
            )}

            {/* AI Insights panel */}
            {aiInsights && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
                <div className="flex items-center gap-2 text-violet-800 font-medium text-sm">
                  <Lightbulb size={15} />
                  AI Analysis
                </div>
                <p className="text-sm text-violet-900">{aiInsights.summary}</p>
                {aiInsights.insights.length > 0 && (
                  <ul className="space-y-1">
                    {aiInsights.insights.map((insight, i) => (
                      <li key={i} className="text-sm text-violet-800 flex items-start gap-2">
                        <span className="mt-0.5 text-violet-400">·</span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

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
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Markets</label>
                    <div className="flex flex-wrap gap-1.5">
                      {availableCountries.map((country) => {
                        const on = newTaskForm.countryCodes.includes(country.code);
                        return (
                          <button
                            key={country.code}
                            type="button"
                            onClick={() => toggleMarket(country.code)}
                            title={country.name}
                            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                              on
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {country.code}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {newTaskForm.countryCodes.length > 1
                        ? `${newTaskForm.countryCodes.length} tasks will be created, one per market`
                        : 'One task per selected market'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Module</label>
                    <select
                      value={newTaskForm.module}
                      onChange={(event) => setNewTaskForm((prev) => ({ ...prev, module: event.target.value }))}
                      className={selectBaseClass}
                    >
                      {availableModules.map((module) => (
                        <option key={module} value={module}>{module}</option>
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
                    <option key={header} value={header}>{header}</option>
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
                    <option key={header} value={header}>{header}</option>
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
                    <option key={header} value={header}>{header}</option>
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
                    <option key={header} value={header}>{header}</option>
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
                      onChange={(event) => setNewTaskForm((prev) => ({ ...prev, priority: event.target.value as Priority }))}
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
                            placeholder="Step description"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            value={row.expectedResult}
                            onChange={(event) => updatePreviewStep(row.id, 'expectedResult', event.target.value)}
                            className={textareaBaseClass}
                            rows={2}
                            placeholder="Expected result"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            value={row.testData || ''}
                            onChange={(event) => updatePreviewStep(row.id, 'testData', event.target.value)}
                            className={textareaBaseClass}
                            rows={2}
                            placeholder="Optional"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            value={row.actualResult || ''}
                            onChange={(event) => updatePreviewStep(row.id, 'actualResult', event.target.value)}
                            className={textareaBaseClass}
                            rows={2}
                            placeholder="Optional"
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
                onClick={() => router.push(`/tasks/${lastImportedTaskId}`)}
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
                {importing ? 'Importing…' : 'Confirm Import'}
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

      {showReplaceConfirm && selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl p-5">
            <h3 className="text-base font-semibold text-slate-900">Confirm Step Replacement</h3>
            <p className="text-sm text-slate-600 mt-2">
              Replace all existing steps in
              <span className="font-semibold text-slate-800"> "{selectedTask.title}" </span>
              with {previewSteps.length} imported steps?
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button onClick={() => setShowReplaceConfirm(false)} className={subtleButtonClass}>
                Cancel
              </button>
              <button onClick={confirmReplaceImport} className={primaryButtonClass}>
                Replace Steps
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
