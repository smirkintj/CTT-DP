'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Bot, Check, FileSpreadsheet, Lightbulb, Loader2, UploadCloud } from 'lucide-react';
import { AdminProductConfig, CountryConfig, Priority, Task, TestStep } from '../types';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass, textareaBaseClass } from '../components/ui/formClasses';
import { notify } from '../lib/notify';
import { isValidDueDate } from '../lib/taskValidation';
import { buildHeaderIndex, detectCountries, groupByStory, readCases, resolveSheet, stripCountryPrefix } from '../lib/sitWorkbook';
import type { StoryGroup } from '../lib/sitWorkbook';

type ParsedRow = Record<string, string>;
type PreviewStep = Pick<TestStep, 'id' | 'order' | 'description' | 'expectedResult' | 'actualResult' | 'testData'>;
type ImportMode = 'existing' | 'new';

type AiInsights = {
  summary: string;
  insights: string[];
};

type DraftMeta = { aiAvailable: boolean; provider: string; fallbackReason: string | null; fallbackCount: number };

type DraftedTask = {
  storyKey: string;
  jiraTicket: string | null;
  title: string;
  description: string;
  module: string | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  countries: string[];
  steps: Array<{ description: string; expectedResult: string }>;
  generatedBy: string;
  fallbackReason?: string;
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

async function parseExcel(file: File): Promise<{ rows: ParsedRow[]; sheetName: string; grid: string[][] }> {
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
  if (!chosen) return { rows: [], sheetName: '', grid: [] };

  const raw = chosen.rows.slice(chosen.headerRow);
  if (raw.length < 2) return { rows: [], sheetName: chosen.name, grid: [] };

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
  return { rows: dataRows, sheetName: chosen.name, grid: raw };
}

/**
 * Build story groups from the resolved grid using the shared parser, so the
 * wizard reads a workbook exactly the way the Jira intake cron does.
 */
function buildStoryGroups(grid: string[][]): StoryGroup[] {
  if (grid.length < 2) return [];
  const idx = buildHeaderIndex(grid[0]);
  const cases = readCases({ name: 'sheet', rows: grid, headerRow: 0, score: 0 }, idx);
  if (cases.length === 0) return [];
  return groupByStory(cases);
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
  // Tasks are always created under a product, and the module must be one of
  // that product's configured modules — the API rejects anything else.
  const [products, setProducts] = useState<AdminProductConfig[]>([]);
  const [productId, setProductId] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/tasks', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setTasks(data as Task[]); })
      .catch(() => {});
    Promise.all([
      fetch('/api/admin/countries').then((r) => r.ok ? r.json() : []),
      fetch('/api/admin/modules').then((r) => r.ok ? r.json() : []),
      fetch('/api/admin/ai-settings').then((r) => r.ok ? r.json() : null),
      fetch('/api/admin/task-config', { cache: 'no-store' }).then((r) => r.ok ? r.json() : [])
    ]).then(([c, m, ai, cfg]) => {
      if (Array.isArray(c)) setAvailableCountries(c);
      if (Array.isArray(m)) setAvailableModules(m);
      if (ai && ai.provider !== 'none' && ai.apiKeySet) setAiEnabled(true);
      if (Array.isArray(cfg)) {
        const active = (cfg as AdminProductConfig[]).filter((p) => p.isActive);
        setProducts(active);
        setProductId((prev) => prev || active[0]?.id || '');
      }
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
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [draftedTasks, setDraftedTasks] = useState<DraftedTask[]>([]);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftMeta, setDraftMeta] = useState<DraftMeta | null>(null);
  const [selectedStories, setSelectedStories] = useState<string[]>([]);

  // Everything downstream — mapping, preview, AI, import — runs on the stories
  // the admin selected, not the whole sheet.
  const activeRows = useMemo(() => {
    if (!storyHeader || selectedStories.length === 0) return rows;
    // groupByStory falls back to the module name (then 'UNGROUPED') for a blank
    // story cell, so match that here rather than inventing a different key.
    const moduleHeader = Object.keys(rows[0] ?? {}).find(
      (h) => h.trim().toLowerCase() === 'module'
    );
    return rows.filter((row) => {
      const key =
        (row[storyHeader] || '').trim() ||
        (moduleHeader ? (row[moduleHeader] || '').trim() : '') ||
        'UNGROUPED';
      return selectedStories.includes(key);
    });
  }, [rows, storyHeader, selectedStories]);

  const toggleStory = (key: string) => {
    setSelectedStories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setAiInsights(null);
  };

  /**
   * Ask the AI to draft one UAT task per selected story. This is the mapping
   * and formatting step — the admin reviews the result rather than wiring
   * columns by hand.
   */
  const generateDrafts = async () => {
    const chosen = stories.filter((st) => selectedStories.includes(st.key));
    if (chosen.length === 0) {
      notify('Select at least one story first.', 'error');
      return;
    }
    setDraftLoading(true);
    try {
      const res = await fetch('/api/import/draft-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stories: chosen })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify(data?.error || 'Could not draft tasks', 'error');
        return;
      }
      const drafted = (data.tasks as DraftedTask[]).map((t) => ({
        ...t,
        // Only offer markets this portal actually has configured.
        countries: t.countries.filter((c) => availableCountries.some((ac) => ac.code === c))
      }));
      setDraftedTasks(drafted);
      setDraftMeta({
        aiAvailable: Boolean(data.aiAvailable),
        provider: String(data.provider ?? 'none'),
        fallbackReason: data.fallbackReason ?? null,
        fallbackCount: Number(data.fallbackCount ?? 0)
      });
      setImportMode('new');
      notify(
        data.aiAvailable
          ? `Drafted ${drafted.length} task${drafted.length === 1 ? '' : 's'}.`
          : `Drafted ${drafted.length} task${drafted.length === 1 ? '' : 's'} without AI — no provider configured.`,
        data.aiAvailable ? 'success' : 'error'
      );
    } catch {
      notify('Could not draft tasks', 'error');
    } finally {
      setDraftLoading(false);
    }
  };

  const updateDraft = (storyKey: string, patch: Partial<DraftedTask>) => {
    setDraftedTasks((prev) =>
      prev.map((t) => (t.storyKey === storyKey ? { ...t, ...patch } : t))
    );
  };

  const toggleDraftMarket = (storyKey: string, code: string) => {
    setDraftedTasks((prev) =>
      prev.map((t) =>
        t.storyKey === storyKey
          ? {
              ...t,
              countries: t.countries.includes(code)
                ? t.countries.filter((c) => c !== code)
                : [...t.countries, code]
            }
          : t
      )
    );
  };

  /** One POST per drafted task; the API fans each out across its markets. */
  const createDraftedTasks = async () => {
    if (!productId) {
      notify('Select a product before creating tasks.', 'error');
      return;
    }
    if (productModules.length === 0) {
      notify('This product has no active modules. Add one under Admin → System Database.', 'error');
      return;
    }
    const missing = draftedTasks.filter((t) => t.countries.length === 0);
    if (missing.length > 0) {
      notify(`Pick at least one market for ${missing.map((m) => m.storyKey).join(', ')}.`, 'error');
      return;
    }

    setImporting(true);
    let created = 0;
    let failed = 0;
    let firstId: string | null = null;

    try {
      for (const draft of draftedTasks) {
        const response = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: draft.title.trim().slice(0, 200),
            description: draft.description.trim(),
            productId,
            module: resolveModule(draft.module),
            priority: draft.priority,
            dueDate: null,
            countries: draft.countries,
            jiraTicket: draft.jiraTicket ?? undefined,
            steps: draft.steps.map((st) => ({
              description: st.description.trim(),
              expectedResult: st.expectedResult.trim(),
              actualResult: '',
              testData: '',
              countryFilter: 'ALL'
            }))
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          failed += 1;
          const detail = data?.error ? `: ${data.error}` : '';
          console.error('[import] task creation failed', draft.storyKey, data);
          notify(`${draft.storyKey} failed${detail}`, 'error');
          continue;
        }
        const list = Array.isArray(data) ? data : [];
        created += list.length;
        if (!firstId && list[0]?.id) firstId = list[0].id;
      }

      if (created === 0) {
        notify('No tasks were created.', 'error');
        return;
      }
      setLastImportedTaskId(firstId);
      notify(
        failed === 0
          ? `Created ${created} task${created === 1 ? '' : 's'}.`
          : `Created ${created} task${created === 1 ? '' : 's'}; ${failed} story failed.`,
        failed === 0 ? 'success' : 'error'
      );
      setStep(3);
    } finally {
      setImporting(false);
    }
  };

  /** Modules the API will accept for the selected product. */
  const productModules = useMemo(
    () => (products.find((p) => p.id === productId)?.modules ?? []).filter((m) => m.isActive),
    [products, productId]
  );

  /** The API rejects a module that is not configured for the product, so an
   *  AI-invented name is only used when it actually matches one. */
  const resolveModule = (suggested?: string | null) => {
    const match = productModules.find(
      (m) => m.name.toLowerCase() === (suggested ?? '').trim().toLowerCase()
    );
    return match?.name ?? productModules[0]?.name ?? '';
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
  }, [activeRows, columnMap]);

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
    let grid: string[][] = [];
    try {
      if (isExcel) {
        const parsed = await parseExcel(file);
        parsedRows = parsed.rows;
        parsedSheet = parsed.sheetName;
        grid = parsed.grid;
      } else {
        const text = await file.text();
        parsedRows = parseCsv(text);
        const csvHeaders = Object.keys(parsedRows[0] || {});
        grid = [csvHeaders, ...parsedRows.map((r) => csvHeaders.map((h) => r[h] ?? ''))];
      }
    } catch (error) {
      // A corrupt or password-protected workbook threw here and the picker
      // simply did nothing, with no indication why.
      console.error('[import] could not read file', error);
      notify('Could not read that file. It may be corrupt or password protected.', 'error');
      return;
    }

    if (parsedRows.length === 0) {
      notify('No usable rows found in file.', 'error');
      return;
    }

    const nextHeaders = Object.keys(parsedRows[0] || {});
    const nextStories = buildStoryGroups(grid);
    const nextStoryHeader =
      nextStories.length > 0
        ? nextHeaders.find((h) =>
            ['user story id (jira)', 'user story id', 'jira', 'jira id', 'ticket'].includes(
              h.trim().toLowerCase().replace(/\s+/g, ' ')
            )
          ) ?? null
        : null;

    setRows(parsedRows);
    setHeaders(nextHeaders);
    setFileName(file.name);
    setSheetName(parsedSheet);
    setStoryHeader(nextStoryHeader);
    setStories(nextStories);
    // Start with everything selected so a single-story sheet needs no clicks.
    setSelectedStories(nextStories.map((s) => s.key));
    setAiInsights(null);
    setDraftedTasks([]);

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
    setDraftedTasks([]);
    setDraftMeta(null);
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
    if (!productId) { notify('Select a product for the new task.', 'error'); return { ok: false }; }
    if (newTaskForm.countryCodes.length === 0) { notify('Select at least one market for the new task.', 'error'); return { ok: false }; }
    if (!newTaskForm.module) { notify('Select module for the new task.', 'error'); return { ok: false }; }
    if (!isValidDueDate(newTaskForm.dueDate || undefined)) { notify('Due date is invalid.', 'error'); return { ok: false }; }

    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: newTaskForm.description.trim(),
        productId,
        module: resolveModule(newTaskForm.module),
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
              <button
                onClick={generateDrafts}
                disabled={draftLoading || stories.length === 0}
                className={`ml-3 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg border transition-colors whitespace-nowrap ${
                  draftLoading || stories.length === 0
                    ? 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed'
                    : 'border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100'
                }`}
                title={aiEnabled ? undefined : 'No AI provider configured — tasks will be drafted without one'}
              >
                {draftLoading ? <Loader2 size={15} className="animate-spin" /> : <Bot size={15} />}
                {draftLoading ? 'Drafting…' : 'Draft UAT tasks'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Product</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className={selectBaseClass}
                >
                  {products.length === 0 && <option value="">No active products</option>}
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Tasks are created under this product; markets and modules come from it.
                </p>
              </div>
              {productId && productModules.length === 0 && (
                <div className="flex items-end">
                  <p className="text-[11px] text-amber-700">
                    This product has no active modules, so tasks cannot be created for it yet.
                    Add one under Admin &rarr; System Database.
                  </p>
                </div>
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

            {/* Drafted tasks — what will be created, editable before commit */}
            {draftedTasks.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {draftedTasks.length} task{draftedTasks.length === 1 ? '' : 's'} drafted
                  </h3>
                  <span className="text-xs text-slate-400">
                    {draftMeta && !draftMeta.aiAvailable
                      ? 'Drafted without AI — no provider configured'
                      : `Drafted by ${draftMeta?.provider ?? 'AI'}`}
                  </span>
                </div>

                {/* The AI ran but some stories fell back — say which and why,
                    rather than leaving them looking like normal output. */}
                {draftMeta?.aiAvailable && draftMeta.fallbackCount > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <span className="font-medium">
                      {draftMeta.fallbackCount} of {draftedTasks.length} drafted without AI.
                    </span>{' '}
                    {draftMeta.fallbackReason}
                  </div>
                )}

                {draftedTasks.map((draft) => (
                  <div key={draft.storyKey} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-brand-600">{draft.jiraTicket ?? draft.storyKey}</span>
                        <span className="text-xs text-slate-400">{draft.steps.length} steps</span>
                        {draft.generatedBy === 'structured' && (
                          <span className="text-xs text-amber-700" title={draft.fallbackReason}>
                            · no AI on this one
                          </span>
                        )}
                      </div>

                      <input
                        value={draft.title}
                        onChange={(e) => updateDraft(draft.storyKey, { title: e.target.value })}
                        className={`${fieldBaseClass} font-medium`}
                        placeholder="Task title"
                      />

                      <textarea
                        value={draft.description}
                        onChange={(e) => updateDraft(draft.storyKey, { description: e.target.value })}
                        className={textareaBaseClass}
                        rows={2}
                        placeholder="Description"
                      />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Priority</label>
                          <select
                            value={draft.priority}
                            onChange={(e) => updateDraft(draft.storyKey, { priority: e.target.value as DraftedTask['priority'] })}
                            className={selectBaseClass}
                          >
                            <option value="HIGH">High</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="LOW">Low</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Module</label>
                          <input
                            value={draft.module ?? ''}
                            onChange={(e) => updateDraft(draft.storyKey, { module: e.target.value })}
                            className={fieldBaseClass}
                            placeholder="Module"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">Markets</label>
                        <div className="flex flex-wrap gap-1.5">
                          {availableCountries.map((country) => {
                            const on = draft.countries.includes(country.code);
                            return (
                              <button
                                key={country.code}
                                type="button"
                                onClick={() => toggleDraftMarket(draft.storyKey, country.code)}
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
                        <p className={`text-[11px] mt-1 ${draft.countries.length === 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                          {draft.countries.length === 0
                            ? 'Pick at least one market'
                            : `${draft.countries.length} task${draft.countries.length === 1 ? '' : 's'} from this story`}
                        </p>
                      </div>
                    </div>

                    <details className="border-t border-slate-100">
                      <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-slate-500 hover:bg-slate-50">
                        Review {draft.steps.length} step{draft.steps.length === 1 ? '' : 's'}
                      </summary>
                      <div className="px-4 pb-4 space-y-3">
                        {draft.steps.map((st, i) => (
                          <div key={i} className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <textarea
                              value={st.description}
                              onChange={(e) => {
                                const steps = [...draft.steps];
                                steps[i] = { ...steps[i], description: e.target.value };
                                updateDraft(draft.storyKey, { steps });
                              }}
                              className={textareaBaseClass}
                              rows={4}
                              placeholder={`Step ${i + 1} description`}
                            />
                            <textarea
                              value={st.expectedResult}
                              onChange={(e) => {
                                const steps = [...draft.steps];
                                steps[i] = { ...steps[i], expectedResult: e.target.value };
                                updateDraft(draft.storyKey, { steps });
                              }}
                              className={textareaBaseClass}
                              rows={4}
                              placeholder="Expected result"
                            />
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ))}

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  Creating will make{' '}
                  <strong>
                    {draftedTasks.reduce((n, t) => n + t.countries.length, 0)} task
                    {draftedTasks.reduce((n, t) => n + t.countries.length, 0) === 1 ? '' : 's'}
                  </strong>{' '}
                  — one per market for each story.
                </div>
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

            {/* Manual mapping — only when tasks have not been drafted. Drafting
                replaces this step; it is the fallback for arbitrary CSVs and
                for replacing steps in an existing task. */}
            {draftedTasks.length === 0 && (
              <>
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
              </>
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
            <button
              onClick={draftedTasks.length > 0 ? createDraftedTasks : handleImport}
              disabled={importing}
              className={primaryButtonClass}
            >
              <span className="inline-flex items-center gap-2">
                {importing
                  ? 'Creating…'
                  : draftedTasks.length > 0
                    ? `Create ${draftedTasks.reduce((n, t) => n + t.countries.length, 0)} task${draftedTasks.reduce((n, t) => n + t.countries.length, 0) === 1 ? '' : 's'}`
                    : 'Confirm Import'}
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
