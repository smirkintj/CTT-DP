'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Task, Priority, TestStep, CountryConfig, AdminProductConfig, JiraTaskPrefill, JiraIssue, JiraIssueGroup } from '../types';
import { Badge } from '../components/Badge';
import { Trash2, Plus, Search, Filter, X, Save, Globe, CheckCircle2, ExternalLink } from 'lucide-react';
import { apiFetch } from '../lib/http';
import { notify } from '../lib/notify';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass, textareaBaseClass } from '../components/ui/formClasses';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isValidDueDate, isValidJiraTicket, normalizeEodTicketInput, normalizeJiraTicketInput } from '../lib/taskValidation';

interface AdminTaskManagementProps {
  tasks: Task[];
  loading: boolean;
  onImport: () => void;
  onEdit: (task: Task) => void;
  onAddTask: (tasks: Task[]) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  availableCountries: CountryConfig[];
  availableModules: string[];
  jiraPrefill?: JiraTaskPrefill | null;
  onJiraPrefillConsumed?: () => void;
}

export const AdminTaskManagement: React.FC<AdminTaskManagementProps> = ({ 
    tasks, 
    loading,
    onImport, 
    onEdit, 
    onAddTask,
    onDeleteTasks,
    availableCountries,
    availableModules,
    jiraPrefill = null,
    onJiraPrefillConsumed
}) => {
  const [stakeholders, setStakeholders] = useState<Array<{
    id: string;
    name: string;
    email: string;
    countryCode: string;
    productAccesses?: Array<{ id: string; name: string; slug: string }>;
  }>>([]);
  const [products, setProducts] = useState<AdminProductConfig[]>([]);
  const [assigneeByCountry, setAssigneeByCountry] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [signedOffFilter, setSignedOffFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'status' | 'createdAt' | 'updatedAt'>('dueDate');
  
  // New Task State
  const [newTask, setNewTask] = useState<Partial<Task>>({
     title: '',
     description: '',
     productId: '',
     productName: '',
     jiraTicket: '',
     featureModule: '',
     priority: Priority.MEDIUM,
     dueDate: '',
     scope: 'Local',
     targetSystem: '',
     targetSystemId: '',
     crNumber: '',
  });
  const [creating, setCreating] = useState(false);
  const [createSaveState, setCreateSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [createError, setCreateError] = useState<string | null>(null);
  const [jiraIssues, setJiraIssues] = useState<JiraIssue[]>([]);
  const [jiraDropdownOpen, setJiraDropdownOpen] = useState(false);
  const [jiraBrowseOpen, setJiraBrowseOpen] = useState(false);
  const [jiraLoadingIssues, setJiraLoadingIssues] = useState(false);
  const [jiraTicketLinked, setJiraTicketLinked] = useState(false);
  const jiraDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {}
  });
  const [isGlobalEditOpen, setIsGlobalEditOpen] = useState(false);
  const [globalEditSaving, setGlobalEditSaving] = useState(false);
  const [isBulkStatusOpen, setIsBulkStatusOpen] = useState(false);
  const [bulkStatusSaving, setBulkStatusSaving] = useState(false);
  const [bulkStatusMessage, setBulkStatusMessage] = useState<string | null>(null);
  const [bulkStatus, setBulkStatus] = useState<'DRAFT' | 'READY' | 'IN_PROGRESS' | 'BLOCKED' | 'FAILED' | 'DEPLOYED'>('READY');
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkAssignSaving, setBulkAssignSaving] = useState(false);
  const [bulkAssignMessage, setBulkAssignMessage] = useState<string | null>(null);
  const [isSummaryExportOpen, setIsSummaryExportOpen] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [summaryDateFrom, setSummaryDateFrom] = useState('');
  const [summaryDateTo, setSummaryDateTo] = useState('');
  const [bulkAssigneeByCountry, setBulkAssigneeByCountry] = useState<Record<string, string>>({});
  const [globalEdit, setGlobalEdit] = useState({
    title: '',
    description: '',
    jiraTicket: '',
    crNumber: '',
    developer: '',
    dueDate: ''
  });

  const [selectedCountries, setSelectedCountries] = useState<string[]>(['SG']);
  const [steps, setSteps] = useState<Partial<TestStep>[]>([
      { id: '1', description: '', expectedResult: '', countryFilter: 'ALL', testData: '' }
  ]);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const defaultNewTask: Partial<Task> = {
    title: '',
    description: '',
    productId: '',
    productName: '',
    jiraTicket: '',
    eodTicket: '',
    featureModule: '',
    priority: Priority.MEDIUM,
    dueDate: '',
    scope: 'Local',
    targetSystem: '',
    targetSystemId: '',
    crNumber: '',
    developer: ''
  };

  const getDefaultTaskValues = (): Partial<Task> => {
    const firstProduct = products[0];
    return {
      ...defaultNewTask,
      productId: firstProduct?.id ?? '',
      productName: firstProduct?.name ?? '',
      featureModule: firstProduct?.modules[0]?.name ?? '',
      targetSystem: firstProduct?.targetSystems[0]?.name ?? '',
      targetSystemId: firstProduct?.targetSystems[0]?.id ?? ''
    };
  };

  const onJiraPrefillConsumedRef = useRef(onJiraPrefillConsumed);
  onJiraPrefillConsumedRef.current = onJiraPrefillConsumed;

  useEffect(() => {
    if (!jiraPrefill) return;

    // Open the modal immediately — products may still be loading but productId/Name
    // come from the prefill. Module/system fields will be populated once products load.
    const product = products.find((item) => item.id === jiraPrefill.productId) ?? products[0];
    setNewTask({
      ...getDefaultTaskValues(),
      productId: product?.id ?? jiraPrefill.productId,
      productName: product?.name ?? jiraPrefill.productName,
      featureModule: product?.modules[0]?.name ?? '',
      targetSystem: product?.targetSystems[0]?.name ?? '',
      targetSystemId: product?.targetSystems[0]?.id ?? '',
      jiraTicket: jiraPrefill.jiraTicket,
      title: jiraPrefill.title,
      description: jiraPrefill.description
    });
    setJiraTicketLinked(Boolean(jiraPrefill.jiraTicket));
    setIsModalOpen(true);
    onJiraPrefillConsumedRef.current?.();
  }, [jiraPrefill]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isModalOpen || !newTask.productId) {
      setJiraIssues([]);
      return;
    }
    let cancelled = false;
    setJiraLoadingIssues(true);
    apiFetch<{ configured: boolean; groups: JiraIssueGroup[] }>('/api/admin/jira-intake')
      .then(data => {
        if (cancelled) return;
        const group = data.groups.find(g => g.productId === newTask.productId);
        setJiraIssues(group?.issues ?? []);
      })
      .catch(() => { /* silently ignore — Jira may not be configured */ })
      .finally(() => { if (!cancelled) setJiraLoadingIssues(false); });
    return () => { cancelled = true; };
  }, [isModalOpen, newTask.productId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (jiraDropdownRef.current && !jiraDropdownRef.current.contains(e.target as Node)) {
        setJiraDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initialTaskDefaults = getDefaultTaskValues();
  const defaultSteps: Partial<TestStep>[] = [
    { id: '1', description: '', expectedResult: '', countryFilter: 'ALL', testData: '' }
  ];

  const resetCreateForm = () => {
    setNewTask(getDefaultTaskValues());
    setSelectedCountries(['SG']);
    setAssigneeByCountry({});
    setSteps(defaultSteps);
    setCreateSaveState('idle');
    setCreateError(null);
    setJiraTicketLinked(false);
  };

  const isCreateDirty =
    (newTask.title ?? '') !== (initialTaskDefaults.title ?? '') ||
    (newTask.description ?? '') !== (initialTaskDefaults.description ?? '') ||
    (newTask.productId ?? '') !== (initialTaskDefaults.productId ?? '') ||
    (newTask.jiraTicket ?? '') !== (initialTaskDefaults.jiraTicket ?? '') ||
    (newTask.featureModule ?? '') !== (initialTaskDefaults.featureModule ?? '') ||
    (newTask.priority ?? Priority.MEDIUM) !== (initialTaskDefaults.priority ?? Priority.MEDIUM) ||
    (newTask.dueDate ?? '') !== (initialTaskDefaults.dueDate ?? '') ||
    (newTask.targetSystemId ?? '') !== (initialTaskDefaults.targetSystemId ?? '') ||
    (newTask.crNumber ?? '') !== (initialTaskDefaults.crNumber ?? '') ||
    (newTask.developer ?? '') !== (initialTaskDefaults.developer ?? '') ||
    selectedCountries.length !== 1 ||
    selectedCountries[0] !== 'SG' ||
    Object.keys(assigneeByCountry).length > 0 ||
    steps.some((step) =>
      (step.description ?? '').trim() !== '' ||
      (step.expectedResult ?? '').trim() !== '' ||
      (step.testData ?? '').trim() !== '' ||
      (step.countryFilter ?? 'ALL') !== 'ALL'
    ) ||
    steps.length !== 1;

  const closeCreateModal = () => {
    if (creating) return;
    if (isCreateDirty) {
      setConfirmDialog({
        open: true,
        title: 'Discard Changes',
        message: 'You have unsaved task inputs. Discard them?',
        confirmLabel: 'Discard',
        onConfirm: () => {
          setIsModalOpen(false);
          resetCreateForm();
        }
      });
      return;
    }
    setIsModalOpen(false);
    resetCreateForm();
  };

  useEffect(() => {
    const loadMetadata = async () => {
      try {
        const [data, config] = await Promise.all([
          apiFetch<Array<{ id: string; name: string; email: string; countryCode: string; productAccesses?: Array<{ id: string; name: string; slug: string }> }>>(
          '/api/admin/stakeholders',
          { cache: 'no-store' }
          ),
          apiFetch<AdminProductConfig[]>('/api/admin/task-config', { cache: 'no-store' })
        ]);
        if (Array.isArray(data)) setStakeholders(data);
        if (Array.isArray(config)) {
          setProducts(config);
          setNewTask((prev) => {
            if (prev.productId) return prev;
            const firstProduct = config[0];
            if (!firstProduct) return prev;
            return {
              ...prev,
              productId: firstProduct.id,
              productName: firstProduct.name,
              featureModule: firstProduct.modules[0]?.name ?? '',
              targetSystem: firstProduct.targetSystems[0]?.name ?? '',
              targetSystemId: firstProduct.targetSystems[0]?.id ?? ''
            };
          });
        }
      } catch {
        notify('Failed to load task configuration', 'error');
      }
    };
    void loadMetadata();
  }, []);

  const currentProduct = products.find((product) => product.id === newTask.productId) ?? null;
  const productModules = currentProduct?.modules ?? [];
  const productTargetSystems = currentProduct?.targetSystems ?? [];

  useEffect(() => {
    if (stakeholders.length === 0) return;
    setAssigneeByCountry((prev) => {
      const next = { ...prev };
      for (const countryCode of selectedCountries) {
        if (!next[countryCode]) {
          const match = stakeholders.find(
            (u) =>
              u.countryCode === countryCode &&
              (newTask.productId
                ? (u.productAccesses ?? []).some((access) => access.id === newTask.productId)
                : true)
          );
          if (match) next[countryCode] = match.id;
        }
      }
      return next;
    });
  }, [stakeholders, selectedCountries, newTask.productId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchInput);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const normalizeStatusKey = (status: string) => status?.toString().trim().replace(/\s+/g, '_').toUpperCase();
  const normalizePriorityKey = (priority: string) => priority?.toString().trim().replace(/\s+/g, '_').toUpperCase();
  const formatDateTime = (value?: string) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const formatDateOnly = (value?: string) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
  };

  const toDateInputValue = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  };

  const fromDateInputValue = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString();
  };

  const refreshTasks = async () => {
    try {
      const refreshed = await apiFetch<Task[]>('/api/tasks', { cache: 'no-store' });
      const mappedTasks = Array.isArray(refreshed)
        ? refreshed.map((task) => ({
            ...task,
            featureModule: task.featureModule ?? (task as any).module ?? 'General',
            productName: task.productName ?? 'EasyOrder',
            productId: task.productId ?? 'prod_easyorder'
          }))
        : [];
      onAddTask(mappedTasks);
    } catch {
      notify('Updated, but failed to refresh tasks. Please reload.', 'error');
    }
  };

  const filteredTasks = useMemo(() => {
    const filtered = tasks.filter(t => 
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.featureModule.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const statusFiltered = statusFilter === 'ALL'
      ? filtered
      : filtered.filter(t => normalizeStatusKey(t.status as unknown as string) === statusFilter);

    const priorityFiltered = priorityFilter === 'ALL'
      ? statusFiltered
      : statusFiltered.filter(t => normalizePriorityKey(t.priority as unknown as string) === priorityFilter);

    const countryFiltered = countryFilter === 'ALL'
      ? priorityFiltered
      : priorityFiltered.filter(t => t.countryCode === countryFilter);

    const signedOffFiltered = signedOffFilter === 'ALL'
      ? countryFiltered
      : countryFiltered.filter(t => signedOffFilter === 'SIGNED' ? !!t.signedOffAt : !t.signedOffAt);

    const statusOrder: Record<string, number> = {
      BLOCKED: 0,
      FAILED: 1,
      IN_PROGRESS: 2,
      READY: 3,
      PENDING: 3,
      PASSED: 4,
      DEPLOYED: 5
    };

    const priorityOrder: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
      LOW: 3
    };

    const toTime = (dateStr?: string) => {
      if (!dateStr) return Number.POSITIVE_INFINITY;
      const time = new Date(dateStr).getTime();
      return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
    };

    const sorted = [...signedOffFiltered].sort((a, b) => {
      if (sortBy === 'priority') {
        const aRank = priorityOrder[normalizePriorityKey(a.priority as unknown as string)] ?? 99;
        const bRank = priorityOrder[normalizePriorityKey(b.priority as unknown as string)] ?? 99;
        return aRank - bRank;
      }
      if (sortBy === 'status') {
        const aRank = statusOrder[normalizeStatusKey(a.status as unknown as string)] ?? 99;
        const bRank = statusOrder[normalizeStatusKey(b.status as unknown as string)] ?? 99;
        return aRank - bRank;
      }
      if (sortBy === 'createdAt') {
        return toTime(a.createdAt) - toTime(b.createdAt);
      }
      if (sortBy === 'updatedAt') {
        return toTime(a.updatedAt) - toTime(b.updatedAt);
      }
      return toTime(a.dueDate) - toTime(b.dueDate);
    });

    return sorted;
  }, [tasks, searchTerm, statusFilter, priorityFilter, countryFilter, signedOffFilter, sortBy]);

  const isAnyBulkActionSaving = bulkAssignSaving || bulkStatusSaving || globalEditSaving;

  useEffect(() => {
    setSelectedTaskIds((prev) => prev.filter((id) => filteredTasks.some((task) => task.id === id)));
  }, [filteredTasks]);

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((prev) => {
      if (checked) return prev.includes(taskId) ? prev : [...prev, taskId];
      return prev.filter((id) => id !== taskId);
    });
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    if (!checked) {
      setSelectedTaskIds([]);
      return;
    }
    setSelectedTaskIds(filteredTasks.map((task) => task.id));
  };

  const handleBulkDelete = () => {
    if (selectedTaskIds.length === 0) return;
    setConfirmDialog({
      open: true,
      title: 'Delete Selected Tasks',
      message: `Delete ${selectedTaskIds.length} selected task(s)? This action cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        const results = await Promise.allSettled(
          selectedTaskIds.map((id) => fetch(`/api/tasks/${id}`, { method: 'DELETE' }))
        );
        const failed: string[] = [];
        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            failed.push(selectedTaskIds[idx]);
            return;
          }
          if (!result.value.ok) failed.push(selectedTaskIds[idx]);
        });
        if (failed.length === 0) {
          notify(`Deleted ${selectedTaskIds.length} task(s).`, 'success');
        } else {
          notify(`Deleted ${selectedTaskIds.length - failed.length}/${selectedTaskIds.length} tasks.`, 'error');
        }
        const deletedIds = selectedTaskIds.filter((id) => !failed.includes(id));
        if (deletedIds.length > 0) onDeleteTasks(deletedIds);
        setSelectedTaskIds([]);
      }
    });
  };

  const openBulkStatusModal = () => {
    if (selectedTaskIds.length === 0) return;
    setBulkStatus('READY');
    setBulkStatusMessage(null);
    setIsBulkStatusOpen(true);
  };

  const handleApplyBulkStatus = async () => {
    if (selectedTaskIds.length === 0 || bulkStatusSaving) return;
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
    const actionable = selectedTasks.filter((task) => !task.signedOffAt);
    if (actionable.length === 0) {
      notify('No editable tasks selected (signed-off tasks are locked).', 'error');
      setBulkStatusMessage('No editable tasks selected. Signed-off tasks are locked.');
      return;
    }

    setBulkStatusSaving(true);
    const responses = await Promise.allSettled(
      actionable.map((task) =>
        fetch(`/api/tasks/${task.id}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: bulkStatus,
            expectedUpdatedAt: task.updatedAt
          })
        })
      )
    );

    let successCount = 0;
    responses.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.ok) {
        successCount += 1;
      }
    });

    const failedCount = actionable.length - successCount;
    const lockedCount = selectedTasks.length - actionable.length;
    if (successCount > 0) {
      const message = `Updated status for ${successCount} task(s).${failedCount > 0 ? ` ${failedCount} failed.` : ''}${lockedCount > 0 ? ` ${lockedCount} locked.` : ''}`;
      setBulkStatusMessage(message);
      notify(
        message,
        failedCount > 0 ? 'error' : 'success'
      );
    } else {
      setBulkStatusMessage(`No tasks updated.${lockedCount > 0 ? ` ${lockedCount} locked.` : ''}`);
      notify(`No tasks updated.${lockedCount > 0 ? ` ${lockedCount} locked.` : ''}`, 'error');
    }

    await refreshTasks();
    setBulkStatusSaving(false);
    setIsBulkStatusOpen(false);
    setSelectedTaskIds([]);
  };

  const openBulkAssignModal = () => {
    if (selectedTaskIds.length === 0) return;
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
    const uniqueCountries = Array.from(new Set(selectedTasks.map((task) => task.countryCode)));
    const defaults: Record<string, string> = {};
    for (const countryCode of uniqueCountries) {
      const countryTasks = selectedTasks.filter((task) => task.countryCode === countryCode);
      const assigneeIds = Array.from(new Set(countryTasks.map((task) => task.assigneeId).filter(Boolean)));
      defaults[countryCode] = assigneeIds.length === 1 ? assigneeIds[0] : '';
    }
    setBulkAssigneeByCountry(defaults);
    setBulkAssignMessage(null);
    setIsBulkAssignOpen(true);
  };

  const handleApplyBulkAssignee = async () => {
    if (selectedTaskIds.length === 0 || bulkAssignSaving) return;
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
    const tasksToUpdate = selectedTasks.filter((task) => {
      if (task.signedOffAt) return false;
      const nextAssigneeId = bulkAssigneeByCountry[task.countryCode];
      if (!nextAssigneeId) return false;
      return nextAssigneeId !== task.assigneeId;
    });

    if (tasksToUpdate.length === 0) {
      notify('No assignee changes to apply.', 'error');
      setBulkAssignMessage('No assignee changes to apply.');
      return;
    }

    setBulkAssignSaving(true);
    const responses = await Promise.allSettled(
      tasksToUpdate.map((task) =>
        fetch(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assigneeId: bulkAssigneeByCountry[task.countryCode],
            expectedUpdatedAt: task.updatedAt
          })
        })
      )
    );

    let successCount = 0;
    responses.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.ok) {
        successCount += 1;
      }
    });
    const failedCount = tasksToUpdate.length - successCount;
    const resultMessage = `Updated assignee for ${successCount}/${tasksToUpdate.length} task(s).`;
    setBulkAssignMessage(resultMessage);
    notify(
      resultMessage,
      failedCount > 0 ? 'error' : 'success'
    );

    await refreshTasks();
    setBulkAssignSaving(false);
    setIsBulkAssignOpen(false);
    setSelectedTaskIds([]);
  };

  const openGlobalEditModal = () => {
    if (selectedTaskIds.length === 0) return;
    const first = tasks.find((task) => task.id === selectedTaskIds[0]);
    setGlobalEdit({
      title: first?.title ?? '',
      description: first?.description ?? '',
      jiraTicket: first?.jiraTicket ?? '',
      crNumber: first?.crNumber ?? '',
      developer: first?.developer ?? '',
      dueDate: toDateInputValue(first?.dueDate)
    });
    setIsGlobalEditOpen(true);
  };

  const handleApplyGlobalEdit = async () => {
    if (selectedTaskIds.length === 0 || globalEditSaving) return;
    const title = globalEdit.title.trim();
    if (!title) {
      notify('Title is required', 'error');
      return;
    }
    if (!isValidJiraTicket(globalEdit.jiraTicket)) {
      notify('Invalid Jira ticket format', 'error');
      return;
    }
    if (globalEdit.dueDate && !isValidDueDate(globalEdit.dueDate)) {
      notify('Invalid due date', 'error');
      return;
    }

    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
    const groupLeads = new Map<string, Task>();
    for (const task of selectedTasks) {
      const key = task.taskGroupId || task.id;
      if (!groupLeads.has(key)) {
        groupLeads.set(key, task);
      }
    }

    setGlobalEditSaving(true);
    let groupsProcessed = 0;
    let tasksUpdated = 0;
    let tasksTotal = 0;
    let tasksSkipped = 0;
    const skippedCountries = new Set<string>();

    for (const task of groupLeads.values()) {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: globalEdit.description,
          jiraTicket: normalizeJiraTicketInput(globalEdit.jiraTicket),
          crNumber: globalEdit.crNumber,
          developer: globalEdit.developer,
          dueDate: fromDateInputValue(globalEdit.dueDate),
          expectedUpdatedAt: task.updatedAt,
          applyToGroup: true
        })
      });

      if (!response.ok) continue;
      groupsProcessed += 1;
      const payload = await response.json().catch(() => null);
      const summary = payload?.globalUpdateSummary;
      if (summary?.requested) {
        tasksUpdated += Number(summary.updated ?? 0);
        tasksTotal += Number(summary.total ?? 0);
        tasksSkipped += Number(summary.skippedSignedOff ?? 0);
        if (Array.isArray(summary.skipped)) {
          for (const item of summary.skipped) {
            if (item?.countryCode) skippedCountries.add(item.countryCode);
          }
        }
      } else {
        tasksUpdated += 1;
        tasksTotal += 1;
      }
    }

    await refreshTasks();

    setGlobalEditSaving(false);
    setIsGlobalEditOpen(false);
    const baseMessage =
      groupsProcessed > 0
        ? `Global update applied to ${tasksUpdated}/${tasksTotal} task copies across ${groupsProcessed} group(s).`
        : 'No groups were updated. Please refresh and retry.';
    const skippedMessage =
      tasksSkipped > 0
        ? ` Skipped signed-off markets: ${Array.from(skippedCountries).join(', ') || tasksSkipped}.`
        : '';
    notify(baseMessage + skippedMessage, groupsProcessed > 0 ? 'success' : 'error');
  };

  const exportFilteredTasksCsv = () => {
    const headers = [
      'Title',
      'Country',
      'Module',
      'Status',
      'Priority',
      'Due Date',
      'Assignee',
      'Stakeholder Email',
      'Jira Ticket',
      'CR Number',
      'Developer',
      'Signed Off At',
      'Signed Off By',
      'Created At',
      'Updated At'
    ];

    const escapeCell = (value: unknown) => {
      const raw = String(value ?? '');
      if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
        return `"${raw.replace(/"/g, '""')}"`;
      }
      return raw;
    };

    const rows = filteredTasks.map((task) => [
      task.title,
      task.countryCode,
      task.featureModule,
      task.status,
      task.priority,
      formatDateOnly(task.dueDate),
      task.assignee?.name || '',
      task.assignee?.email || '',
      task.jiraTicket || '',
      task.crNumber || '',
      task.developer || '',
      task.signedOffAt ? formatDateTime(task.signedOffAt) : '',
      task.signedOffBy?.name || task.signedOffBy?.email || '',
      formatDateTime(task.createdAt),
      formatDateTime(task.updatedAt)
    ]);

    const csvBody = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
    const csv = `\uFEFF${csvBody}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ctt_tasks_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify('CSV exported.', 'success');
  };

  const exportSummaryCsv = () => {
    const from = summaryDateFrom ? new Date(`${summaryDateFrom}T00:00:00`) : null;
    const to = summaryDateTo ? new Date(`${summaryDateTo}T23:59:59.999`) : null;
    if (from && Number.isNaN(from.getTime())) {
      notify('Invalid summary date range', 'error');
      return;
    }
    if (to && Number.isNaN(to.getTime())) {
      notify('Invalid summary date range', 'error');
      return;
    }
    if (from && to && from.getTime() > to.getTime()) {
      notify('Summary start date must be before end date', 'error');
      return;
    }

    const withinRange = (task: Task) => {
      if (!from && !to) return true;
      const created = task.createdAt ? new Date(task.createdAt) : null;
      if (!created || Number.isNaN(created.getTime())) return false;
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    };

    const targetTasks = tasks.filter(withinRange);
    const countrySummary = new Map<string, { total: number; signedOff: number; deployed: number; failed: number; blocked: number }>();
    const moduleSummary = new Map<string, { total: number; signedOff: number; deployed: number; failed: number; blocked: number }>();
    const seed = () => ({ total: 0, signedOff: 0, deployed: 0, failed: 0, blocked: 0 });

    const bump = (
      map: Map<string, { total: number; signedOff: number; deployed: number; failed: number; blocked: number }>,
      key: string,
      task: Task
    ) => {
      const row = map.get(key) || seed();
      row.total += 1;
      if (task.signedOffAt) row.signedOff += 1;
      if ((task.status || '').toString().toUpperCase() === 'DEPLOYED') row.deployed += 1;
      if ((task.status || '').toString().toUpperCase() === 'FAILED') row.failed += 1;
      if ((task.status || '').toString().toUpperCase() === 'BLOCKED') row.blocked += 1;
      map.set(key, row);
    };

    targetTasks.forEach((task) => {
      bump(countrySummary, task.countryCode || 'N/A', task);
      bump(moduleSummary, task.featureModule || 'General', task);
    });

    const summaryHeaders = ['Type', 'Dimension', 'Total Tasks', 'Signed Off', 'Deployed', 'Failed', 'Blocked'];
    const summaryRows: Array<Array<string | number>> = [];
    Array.from(countrySummary.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([dimension, stats]) => summaryRows.push(['Country', dimension, stats.total, stats.signedOff, stats.deployed, stats.failed, stats.blocked]));
    Array.from(moduleSummary.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([dimension, stats]) => summaryRows.push(['Module', dimension, stats.total, stats.signedOff, stats.deployed, stats.failed, stats.blocked]));

    if (summaryRows.length === 0) {
      notify('No tasks found for selected range.', 'error');
      return;
    }

    const escapeCell = (value: unknown) => {
      const raw = String(value ?? '');
      if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
        return `"${raw.replace(/"/g, '""')}"`;
      }
      return raw;
    };

    const csvBody = [summaryHeaders, ...summaryRows].map((row) => row.map(escapeCell).join(',')).join('\n');
    const csv = `\uFEFF${csvBody}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ctt_summary_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify(`Summary exported (${targetTasks.length} tasks in scope).`, 'success');
    setIsSummaryExportOpen(false);
  };

  const toggleCountry = (code: string) => {
      if (selectedCountries.includes(code)) {
          if (selectedCountries.length > 1) { // Prevent empty selection
              setSelectedCountries(selectedCountries.filter(c => c !== code));
              setAssigneeByCountry((prev) => {
                const next = { ...prev };
                delete next[code];
                return next;
              });
          }
      } else {
          setSelectedCountries([...selectedCountries, code]);
          const defaultStakeholder = stakeholders.find((u) => u.countryCode === code);
          if (defaultStakeholder) {
            setAssigneeByCountry((prev) => ({ ...prev, [code]: prev[code] || defaultStakeholder.id }));
          }
      }
  };

  const handleCreate = async () => {
     const title = (newTask.title || '').trim();
     const jiraTicket = (newTask.jiraTicket || '').trim();
     const invalidJira = !isValidJiraTicket(jiraTicket);
     const normalizedJira = normalizeJiraTicketInput(jiraTicket);
     const invalidSteps = steps.some(
       (step) => !(step.description || '').trim() || !(step.expectedResult || '').trim()
     );

     if (!title) {
       setCreateError('Title is required.');
       return;
     }
     if (title.length > 200) {
       setCreateError('Title is too long.');
       return;
     }
     if (invalidJira) {
       setCreateError('Jira ticket format is invalid.');
       return;
     }
     if (!isValidDueDate(newTask.dueDate)) {
       setCreateError('Due date is invalid.');
       return;
     }
     if (selectedCountries.length === 0) {
       setCreateError('Please select at least one country.');
       return;
     }
     if (invalidSteps) {
       setCreateError('Each step needs description and expected result.');
       return;
     }

     try {
       setCreating(true);
       setCreateSaveState('saving');
       setCreateError(null);
      const data = await apiFetch<Task[]>('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTask.title,
          description: newTask.description,
          productId: newTask.productId,
          jiraTicket: normalizedJira || undefined,
          jiraTicketVerified: jiraTicketLinked && Boolean(normalizedJira),
          eodTicket: normalizeEodTicketInput(newTask.eodTicket) || undefined,
          featureModule: newTask.featureModule,
          module: newTask.featureModule,
          targetSystemId: newTask.targetSystemId,
          crNumber: newTask.crNumber,
          developer: newTask.developer,
           priority: newTask.priority,
           dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : undefined,
           countries: selectedCountries,
           steps,
           assigneeByCountry
         })
       });

       const createdTasks = Array.isArray(data) ? data : [];
       onAddTask(createdTasks);
       setIsModalOpen(false);
       resetCreateForm();
       setCreateSaveState('saved');
       notify('Task(s) created successfully', 'success');
     } catch (error) {
       setCreateError(error instanceof Error ? error.message : 'Failed to create tasks');
       setCreateSaveState('error');
     } finally {
       setCreating(false);
     }
  };


  const addStepRow = () => {
      setSteps([...steps, { id: `${steps.length + 1}`, description: '', expectedResult: '', countryFilter: 'ALL', testData: '' }]);
  };

  const removeStepRow = (idx: number) => {
      const newSteps = [...steps];
      newSteps.splice(idx, 1);
      setSteps(newSteps);
  };

  const updateStep = (idx: number, field: keyof TestStep, value: string) => {
      const newSteps = [...steps];
      newSteps[idx] = { ...newSteps[idx], [field]: value };
      setSteps(newSteps);
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isModalOpen && isCreateDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isModalOpen, isCreateDirty]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!actionsMenuRef.current) return;
      if (!actionsMenuRef.current.contains(event.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold text-slate-900">Task Management</h1>
           <p className="text-slate-500">Create, edit, and organize UAT scenarios.</p>
        </div>
        <div className="flex items-center gap-2">
           <div className="relative" ref={actionsMenuRef}>
             <button
               onClick={() => setIsActionMenuOpen((prev) => !prev)}
               className={`${subtleButtonClass} shadow-sm flex items-center gap-2`}
               aria-expanded={isActionMenuOpen}
               aria-haspopup="menu"
             >
               Actions
               {selectedTaskIds.length > 0 && (
                 <span className="rounded-full bg-slate-900 text-white px-2 py-0.5 text-[10px] font-semibold">
                   {selectedTaskIds.length}
                 </span>
               )}
             </button>
             {isActionMenuOpen && (
               <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg p-2 z-30" role="menu">
                 <button
                   onClick={() => {
                     setIsActionMenuOpen(false);
                     openBulkStatusModal();
                   }}
                   disabled={selectedTaskIds.length === 0 || isAnyBulkActionSaving}
                   className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                 >
                   Bulk Status ({selectedTaskIds.length})
                 </button>
                 <button
                   onClick={() => {
                     setIsActionMenuOpen(false);
                     openBulkAssignModal();
                   }}
                   disabled={selectedTaskIds.length === 0 || isAnyBulkActionSaving}
                   className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                 >
                   Bulk Assign ({selectedTaskIds.length})
                 </button>
                 <button
                   onClick={() => {
                     setIsActionMenuOpen(false);
                     openGlobalEditModal();
                   }}
                   disabled={selectedTaskIds.length === 0 || isAnyBulkActionSaving}
                   className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                 >
                   Global Edit ({selectedTaskIds.length})
                 </button>
                 <button
                   onClick={() => {
                     setIsActionMenuOpen(false);
                     handleBulkDelete();
                   }}
                   disabled={selectedTaskIds.length === 0 || isAnyBulkActionSaving}
                   className="w-full text-left px-3 py-2 rounded-lg text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                 >
                   Delete Selected ({selectedTaskIds.length})
                 </button>
                 <div className="my-2 border-t border-slate-100" />
                 <button
                   onClick={() => {
                     setIsActionMenuOpen(false);
                     exportFilteredTasksCsv();
                   }}
                   className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                 >
                   Export CSV
                 </button>
                 <button
                   onClick={() => {
                     setIsActionMenuOpen(false);
                     setIsSummaryExportOpen(true);
                   }}
                   className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                 >
                   Export Summary
                 </button>
                 <button
                   onClick={() => {
                     setIsActionMenuOpen(false);
                     onImport();
                   }}
                   className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                 >
                   Import Steps
                 </button>
               </div>
             )}
           </div>
           <button 
             onClick={() => {
               resetCreateForm();
               setIsActionMenuOpen(false);
               setIsModalOpen(true);
             }}
             className={`${primaryButtonClass} shadow-sm flex items-center gap-2`}
           >
             <Plus size={16}/> New Task
           </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
         {/* Toolbar */}
         <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="relative max-w-sm w-full">
               <label htmlFor="admin-task-search" className="sr-only">Search tasks</label>
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <input
                 id="admin-task-search"
                 type="text" 
                 className={`w-full pl-9 pr-4 py-2 ${fieldBaseClass}`} 
                 placeholder="Search tasks..."
                 value={searchInput}
                 onChange={(e) => setSearchInput(e.target.value)}
               />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="admin-task-sort" className="sr-only">Sort tasks</label>
              <select
                id="admin-task-sort"
                className="px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-600"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'dueDate' | 'priority' | 'status' | 'createdAt' | 'updatedAt')}
              >
                <option value="dueDate">Sort: Due date</option>
                <option value="priority">Sort: Priority</option>
                <option value="status">Sort: Status</option>
                <option value="createdAt">Sort: Created</option>
                <option value="updatedAt">Sort: Last updated</option>
              </select>
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`p-2 rounded-lg ${isFilterOpen ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-200'}`}
                aria-expanded={isFilterOpen}
                aria-controls="admin-task-filters"
                aria-label="Toggle task filters"
              >
                 <Filter size={18} />
              </button>
            </div>
         </div>

         {isFilterOpen && (
           <div id="admin-task-filters" className="p-4 border-b border-slate-200 bg-white">
             <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
               <div>
                 <label className="block text-slate-500 font-medium mb-1">Status</label>
                 <select
                   className="w-full rounded-md border-slate-300 text-sm"
                   value={statusFilter}
                   onChange={(e) => setStatusFilter(e.target.value)}
                 >
                   <option value="ALL">All</option>
                   <option value="READY">Ready</option>
                   <option value="IN_PROGRESS">In Progress</option>
                   <option value="PASSED">Passed</option>
                   <option value="FAILED">Failed</option>
                   <option value="DEPLOYED">Deployed</option>
                   <option value="BLOCKED">Blocked</option>
                 </select>
               </div>
               <div>
                 <label className="block text-slate-500 font-medium mb-1">Priority</label>
                 <select
                   className="w-full rounded-md border-slate-300 text-sm"
                   value={priorityFilter}
                   onChange={(e) => setPriorityFilter(e.target.value)}
                 >
                   <option value="ALL">All</option>
                   <option value="HIGH">High</option>
                   <option value="MEDIUM">Medium</option>
                   <option value="LOW">Low</option>
                   <option value="CRITICAL">Critical</option>
                 </select>
               </div>
               <div>
                 <label className="block text-slate-500 font-medium mb-1">Country</label>
                 <select
                   className="w-full rounded-md border-slate-300 text-sm"
                   value={countryFilter}
                   onChange={(e) => setCountryFilter(e.target.value)}
                 >
                   <option value="ALL">All</option>
                   {availableCountries.map((country) => (
                     <option key={country.code} value={country.code}>{country.code}</option>
                   ))}
                 </select>
               </div>
               <div>
                 <label className="block text-slate-500 font-medium mb-1">Signed off</label>
                 <select
                   className="w-full rounded-md border-slate-300 text-sm"
                   value={signedOffFilter}
                   onChange={(e) => setSignedOffFilter(e.target.value)}
                 >
                   <option value="ALL">All</option>
                   <option value="SIGNED">Signed off</option>
                   <option value="NOT_SIGNED">Not signed off</option>
                 </select>
               </div>
             </div>
           </div>
         )}

         {/* Table */}
         <div className="max-h-[68vh] overflow-auto">
            <table className="w-full table-fixed text-sm text-left">
               <caption className="sr-only">Admin task management table</caption>
               <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                     <th className="px-3 py-4 w-[4%]">
                       <input
                         type="checkbox"
                         checked={filteredTasks.length > 0 && selectedTaskIds.length === filteredTasks.length}
                         onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                         onClick={(e) => e.stopPropagation()}
                         className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-500"
                         aria-label="Select all visible tasks"
                       />
                     </th>
                     <th className="px-4 py-4 w-[22%]">Task</th>
                     <th className="px-3 py-4 w-[12%]">Product</th>
                     <th className="px-3 py-4 w-[14%]">Module</th>
                     <th className="px-3 py-4 w-[8%]">Country</th>
                     <th className="px-3 py-4 w-[11%]">Status</th>
                     <th className="px-3 py-4 w-[10%]">Priority</th>
                     <th className="px-3 py-4 w-[12%]">Due</th>
                     <th className="px-3 py-4 w-[12%]">Assignee</th>
                     <th className="px-3 py-4 w-[8%]">Signed Off</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {loading && filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-10 text-center text-slate-500">
                        Loading tasks for task management...
                      </td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-6 py-10 text-center text-slate-400">
                        No tasks found. Adjust filters or search to continue.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map(task => (
                      <tr
                        key={task.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer focus-within:bg-slate-50"
                        onClick={() => onEdit(task)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onEdit(task);
                          }
                        }}
                        tabIndex={0}
                        aria-label={`Open task ${task.title}`}
                      >
                         <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                           <input
                             type="checkbox"
                             checked={selectedTaskIds.includes(task.id)}
                             onChange={(e) => toggleTaskSelection(task.id, e.target.checked)}
                             className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-500"
                             aria-label={`Select task ${task.title}`}
                           />
                         </td>
                         <td className="px-4 py-4 font-medium text-slate-900 truncate" title={task.title}>{task.title}</td>
                         <td className="px-3 py-4">
                            <Badge type="product" value={task.productName || 'EasyOrder'} />
                         </td>
                         <td className="px-3 py-4">
                            <Badge type="module" value={task.featureModule} />
                         </td>
                         <td className="px-3 py-4">{task.countryCode}</td>
                         <td className="px-3 py-4">
                            <Badge type="status" value={task.status} />
                         </td>
                         <td className="px-3 py-4">
                            <Badge type="priority" value={task.priority} />
                         </td>
                         <td className="px-3 py-4 text-slate-600 text-xs">{formatDateOnly(task.dueDate)}</td>
                         <td className="px-3 py-4 text-slate-600 text-xs truncate" title={task.assignee?.name || task.assignee?.email || 'Unassigned'}>
                           {task.assignee?.name || task.assignee?.email || 'Unassigned'}
                         </td>
                         <td className="px-3 py-4 text-slate-600 text-xs">
                           {task.signedOffAt ? 'Yes' : 'No'}
                         </td>
                      </tr>
                    ))
                  )}
               </tbody>
            </table>
         </div>
         <div className="p-4 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
            {loading ? 'Loading tasks...' : `Showing ${filteredTasks.length} tasks`}
         </div>
      </div>

      {/* Create Task Modal */}
      {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl animate-in zoom-in-95 my-8">
                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                   <h2 className="text-lg font-bold text-slate-900">Create New Task</h2>
                   <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-600" aria-label="Close create task modal">
                      <X size={20} />
                   </button>
                </div>
                
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                   
                   {/* Main Info */}
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                          <input 
                             type="text" 
                             className={fieldBaseClass}
                             placeholder="e.g. Verify Cart Calculation"
                             value={newTask.title}
                             onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                          />
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Product</label>
                          <select
                             className={selectBaseClass}
                             value={newTask.productId}
                             onChange={(e) => {
                               const nextProduct = products.find((product) => product.id === e.target.value);
                               setNewTask({
                                 ...newTask,
                                 productId: e.target.value,
                                 productName: nextProduct?.name ?? '',
                                 featureModule: nextProduct?.modules[0]?.name ?? '',
                                 targetSystem: nextProduct?.targetSystems[0]?.name ?? '',
                                 targetSystemId: nextProduct?.targetSystems[0]?.id ?? ''
                               });
                               setAssigneeByCountry({});
                             }}
                          >
                             {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                          </select>
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Target System</label>
                          <select 
                             className={selectBaseClass}
                             value={newTask.targetSystemId}
                             onChange={(e) => {
                               const nextTargetSystem = productTargetSystems.find((item) => item.id === e.target.value);
                               setNewTask({
                                 ...newTask,
                                 targetSystemId: e.target.value,
                                 targetSystem: nextTargetSystem?.name ?? ''
                               });
                             }}
                          >
                             {productTargetSystems.map((targetSystem) => (
                               <option key={targetSystem.id} value={targetSystem.id}>{targetSystem.name}</option>
                             ))}
                          </select>
                       </div>
                   </div>

                   <div className="relative" ref={jiraDropdownRef}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Jira Ticket (Optional)</label>
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            className={fieldBaseClass}
                            placeholder="e.g. UAT-123 or type to search"
                            value={newTask.jiraTicket || ''}
                            autoComplete="off"
                            onChange={(e) => {
                              setNewTask({ ...newTask, jiraTicket: e.target.value });
                              setJiraTicketLinked(false);
                              setJiraDropdownOpen(e.target.value.length > 0 && jiraIssues.length > 0);
                            }}
                            onFocus={() => {
                              if ((newTask.jiraTicket || '').length > 0 && jiraIssues.length > 0) setJiraDropdownOpen(true);
                            }}
                          />
                          {jiraDropdownOpen && (() => {
                            const q = (newTask.jiraTicket || '').toLowerCase();
                            const filtered = jiraIssues.filter(i => i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)).slice(0, 6);
                            if (filtered.length === 0) return null;
                            return (
                              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white rounded-lg border border-slate-200 shadow-lg overflow-hidden">
                                {filtered.map(issue => (
                                  <button
                                    key={issue.key}
                                    type="button"
                                    className="w-full text-left px-3 py-2.5 hover:bg-brand-50 transition-colors flex items-start gap-2 border-b border-slate-50 last:border-0"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      setNewTask(prev => ({
                                        ...prev,
                                        jiraTicket: issue.key,
                                        title: prev.title || issue.summary,
                                      }));
                                      setJiraTicketLinked(true);
                                      setJiraDropdownOpen(false);
                                    }}
                                  >
                                    <span className="text-xs font-mono font-semibold text-brand-600 shrink-0 mt-0.5">{issue.key}</span>
                                    <span className="text-sm text-slate-700 line-clamp-1">{issue.summary}</span>
                                    {issue.status && <span className="ml-auto text-[10px] text-slate-400 shrink-0 mt-0.5">{issue.status}</span>}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        {jiraTicketLinked && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium shrink-0">
                            <CheckCircle2 size={13} /> Linked
                          </span>
                        )}
                        {jiraLoadingIssues ? (
                          <svg className="animate-spin w-4 h-4 text-slate-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                        ) : jiraIssues.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setJiraBrowseOpen(true)}
                            className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-colors whitespace-nowrap"
                          >
                            Browse
                          </button>
                        ) : null}
                      </div>
                   </div>

                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">EOD Ticket (Optional)</label>
                      <div className="relative">
                        <input
                          type="text"
                          className={fieldBaseClass}
                          style={{ paddingRight: newTask.eodTicket ? '2.5rem' : undefined }}
                          placeholder="e.g. 42 or EOD-42"
                          value={newTask.eodTicket || ''}
                          autoComplete="off"
                          onChange={(e) => setNewTask({ ...newTask, eodTicket: e.target.value })}
                        />
                        {newTask.eodTicket && (
                          <a
                            href={`https://dkshdigital.atlassian.net/browse/${normalizeEodTicketInput(newTask.eodTicket)}`}
                            target="_blank"
                            rel="noreferrer"
                            title={`Open ${normalizeEodTicketInput(newTask.eodTicket)}`}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 inline-flex items-center justify-center rounded-lg text-blue-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Module</label>
                         <select 
                            className={selectBaseClass}
                            value={newTask.featureModule}
                            onChange={(e) => setNewTask({...newTask, featureModule: e.target.value})}
                         >
                            {productModules.map((moduleItem) => <option key={moduleItem.id} value={moduleItem.name}>{moduleItem.name}</option>)}
                         </select>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                         <select 
                            className={selectBaseClass}
                            value={newTask.priority}
                            onChange={(e) => setNewTask({...newTask, priority: e.target.value as Priority})}
                         >
                            <option value={Priority.LOW}>Low</option>
                            <option value={Priority.MEDIUM}>Medium</option>
                            <option value={Priority.HIGH}>High</option>
                            <option value={Priority.CRITICAL}>Critical</option>
                         </select>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">CR No (Optional)</label>
                         <input 
                            type="text" 
                            className={fieldBaseClass}
                            placeholder="e.g. CR-123"
                            value={newTask.crNumber}
                            onChange={(e) => setNewTask({...newTask, crNumber: e.target.value})}
                         />
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Developer (Optional)</label>
                         <input 
                            type="text" 
                            className={fieldBaseClass}
                            placeholder="e.g. John Tan"
                            value={newTask.developer || ''}
                            onChange={(e) => setNewTask({...newTask, developer: e.target.value})}
                         />
                      </div>
                   </div>

                   {/* Country Selection (Multi) */}
                   <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                            <Globe size={16}/> Assign Countries (Multi-select)
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {availableCountries.map(c => {
                                const isSelected = selectedCountries.includes(c.code);
                                return (
                                    <button 
                                        key={c.code}
                                        onClick={() => toggleCountry(c.code)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${isSelected ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
                                    >
                                        {c.name} {isSelected && '✓'}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2">A separate task instance will be created for each selected country.</p>
                   </div>

                   <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Assign Stakeholder By Country</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {selectedCountries.map((countryCode) => {
                          const options = stakeholders.filter(
                            (u) =>
                              u.countryCode === countryCode &&
                              (newTask.productId
                                ? (u.productAccesses ?? []).some((access) => access.id === newTask.productId)
                                : true)
                          );
                          return (
                            <div key={countryCode} className="bg-white border border-slate-200 rounded-md p-3">
                              <div className="text-xs text-slate-500 mb-1">{countryCode}</div>
                              <select
                                className="w-full rounded-md border-slate-300 text-sm"
                                value={assigneeByCountry[countryCode] || ''}
                                onChange={(e) => setAssigneeByCountry((prev) => ({ ...prev, [countryCode]: e.target.value }))}
                              >
                                <option value="">Auto-assign</option>
                                {options.map((user) => (
                                  <option key={user.id} value={user.id}>
                                    {user.name || user.email}
                                  </option>
                                ))}
                              </select>
                              {options.length === 0 && (
                                <p className="mt-2 text-[11px] text-amber-600">
                                  No stakeholder in {countryCode} currently has access to this product.
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                          <textarea 
                             className={`${textareaBaseClass} h-20`}
                             placeholder="Description of the test case..."
                             value={newTask.description}
                             onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                          />
                       </div>
                       <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                          <input 
                             type="date"
                             className={fieldBaseClass}
                             value={newTask.dueDate}
                             onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                          />
                       </div>
                   </div>

                   {/* Step Builder */}
                   <div className="border-t border-slate-100 pt-4">
                      <div className="flex justify-between items-center mb-2">
                         <h3 className="font-semibold text-slate-900 text-sm">Test Steps</h3>
                         <button type="button" onClick={addStepRow} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                            <Plus size={12}/> Add Step
                         </button>
                      </div>
                      
                      <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                        <div className="grid grid-cols-12 gap-0 text-xs font-semibold text-slate-500 bg-slate-100 border-b border-slate-200 p-2">
                            <div className="col-span-1 text-center">#</div>
                            <div className="col-span-3">Description</div>
                            <div className="col-span-3">Expected Result</div>
                            <div className="col-span-2">Test Data</div>
                            <div className="col-span-2">Applicable To</div>
                            <div className="col-span-1"></div>
                        </div>
                        <div className="divide-y divide-slate-200">
                             {steps.map((step, idx) => (
                                <div key={idx} className="grid grid-cols-12 gap-2 p-2 items-start hover:bg-white transition-colors">
                                   <div className="col-span-1 flex items-center justify-center pt-2">
                                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                                   </div>
                                   <div className="col-span-3">
                                      <textarea 
                                         placeholder="Step Action"
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
                                         rows={2}
                                         value={step.description}
                                         onChange={(e) => updateStep(idx, 'description', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-3">
                                      <textarea 
                                         placeholder="Expected Result"
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
                                         rows={2}
                                         value={step.expectedResult}
                                         onChange={(e) => updateStep(idx, 'expectedResult', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-2">
                                      <textarea
                                         placeholder="Input data..."
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
                                         rows={2}
                                         value={step.testData}
                                         onChange={(e) => updateStep(idx, 'testData', e.target.value)}
                                      />
                                   </div>
                                   <div className="col-span-2">
                                      <select 
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
                                         value={step.countryFilter || 'ALL'}
                                         onChange={(e) => updateStep(idx, 'countryFilter', e.target.value)}
                                      >
                                          <option value="ALL">All Selected</option>
                                          {selectedCountries.map(sc => (
                                              <option key={sc} value={sc}>{sc} Only</option>
                                          ))}
                                      </select>
                                   </div>
                                   <div className="col-span-1 flex justify-center pt-2">
                                      <button onClick={() => removeStepRow(idx)} className="text-slate-400 hover:text-red-500" aria-label={`Remove step ${idx + 1}`}>
                                         <Trash2 size={14}/>
                                      </button>
                                   </div>
                                </div>
                             ))}
                        </div>
                      </div>
                   </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-xl flex justify-end gap-3">
                   <button onClick={closeCreateModal} className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium">Cancel</button>
                   {createError && (
                     <p className="text-xs text-rose-600 mr-auto self-center">{createError}</p>
                   )}
                   <button onClick={handleCreate} disabled={creating} className="px-4 py-2 bg-slate-900 text-white rounded-md hover:bg-slate-800 text-sm font-medium flex items-center gap-2 disabled:opacity-60">
                      <Save size={16}/>
                      {createSaveState === 'saving' ? 'Creating...' : `Create ${selectedCountries.length} Tasks`}
                   </button>
                </div>
             </div>
          </div>
      )}

      {jiraBrowseOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setJiraBrowseOpen(false)}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Browse Jira Tickets</h3>
                <p className="text-xs text-slate-500 mt-0.5">{jiraIssues.length} ticket{jiraIssues.length !== 1 ? 's' : ''} ready for selection</p>
              </div>
              <button type="button" onClick={() => setJiraBrowseOpen(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto">
              {jiraIssues.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No tickets available</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {jiraIssues.map(issue => {
                    const isSelected = newTask.jiraTicket === issue.key;
                    return (
                      <button
                        key={issue.key}
                        type="button"
                        onClick={() => {
                          setNewTask(prev => ({
                            ...prev,
                            jiraTicket: issue.key,
                            title: prev.title || issue.summary,
                          }));
                          setJiraTicketLinked(true);
                          setJiraBrowseOpen(false);
                        }}
                        className={`text-left p-3 rounded-xl border-2 transition-all hover:shadow-md flex flex-col gap-1.5 ${
                          isSelected
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-slate-200 bg-white hover:border-brand-300'
                        }`}
                      >
                        <span className="text-xs font-mono font-bold text-brand-600">{issue.key}</span>
                        <span className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug">{issue.summary}</span>
                        <div className="flex items-center gap-1.5 mt-auto flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{issue.status}</span>
                          {issue.priority && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">{issue.priority}</span>}
                        </div>
                        {issue.assigneeName && <span className="text-[10px] text-slate-400 truncate">{issue.assigneeName}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isGlobalEditOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl p-5">
            <h3 className="text-base font-semibold text-slate-900">Global Edit for Selected Task Groups</h3>
            <p className="text-xs text-slate-500 mt-1">
              Applies to grouped market tasks. Signed-off tasks are skipped automatically.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Title</label>
                <input className={fieldBaseClass} value={globalEdit.title} onChange={(e) => setGlobalEdit((prev) => ({ ...prev, title: e.target.value }))} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Description</label>
                <textarea className={textareaBaseClass} value={globalEdit.description} onChange={(e) => setGlobalEdit((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Jira Ticket</label>
                <input className={fieldBaseClass} value={globalEdit.jiraTicket} onChange={(e) => setGlobalEdit((prev) => ({ ...prev, jiraTicket: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">CR Number</label>
                <input className={fieldBaseClass} value={globalEdit.crNumber} onChange={(e) => setGlobalEdit((prev) => ({ ...prev, crNumber: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Developer</label>
                <input className={fieldBaseClass} value={globalEdit.developer} onChange={(e) => setGlobalEdit((prev) => ({ ...prev, developer: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Due Date</label>
                <input type="date" className={fieldBaseClass} value={globalEdit.dueDate} onChange={(e) => setGlobalEdit((prev) => ({ ...prev, dueDate: e.target.value }))} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setIsGlobalEditOpen(false)} className={subtleButtonClass} disabled={globalEditSaving}>
                Cancel
              </button>
              <button onClick={handleApplyGlobalEdit} className={primaryButtonClass} disabled={globalEditSaving}>
                {globalEditSaving ? 'Applying...' : 'Apply Global Edit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBulkStatusOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl p-5" aria-busy={bulkStatusSaving}>
            <h3 className="text-base font-semibold text-slate-900">Bulk Update Status</h3>
            <p className="text-xs text-slate-500 mt-1">
              Applies to selected tasks. Signed-off tasks remain unchanged.
            </p>
            <div className="mt-4">
              <label className="block text-xs text-slate-500 mb-1">Target status</label>
              <select
                className={selectBaseClass}
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as typeof bulkStatus)}
              >
                <option value="DRAFT">Draft</option>
                <option value="READY">Ready</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="BLOCKED">Blocked</option>
                <option value="FAILED">Failed</option>
                <option value="DEPLOYED">Deployed</option>
              </select>
            </div>
            {bulkStatusMessage && (
              <p className="mt-3 text-xs text-slate-500" role="status" aria-live="polite">
                {bulkStatusMessage}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setIsBulkStatusOpen(false)} className={subtleButtonClass} disabled={bulkStatusSaving}>
                Cancel
              </button>
              <button onClick={handleApplyBulkStatus} className={primaryButtonClass} disabled={bulkStatusSaving}>
                {bulkStatusSaving ? 'Applying...' : 'Apply Status'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBulkAssignOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl p-5" aria-busy={bulkAssignSaving}>
            <h3 className="text-base font-semibold text-slate-900">Bulk Assign Stakeholders</h3>
            <p className="text-xs text-slate-500 mt-1">
              Choose assignee per country. Only selected tasks in that country will be updated.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from(new Set(tasks.filter((task) => selectedTaskIds.includes(task.id)).map((task) => task.countryCode))).map((countryCode) => {
                const options = stakeholders.filter((u) => u.countryCode === countryCode);
                return (
                  <div key={countryCode}>
                    <label className="block text-xs text-slate-500 mb-1">{countryCode}</label>
                    <select
                      className={selectBaseClass}
                      value={bulkAssigneeByCountry[countryCode] || ''}
                      onChange={(e) => setBulkAssigneeByCountry((prev) => ({ ...prev, [countryCode]: e.target.value }))}
                    >
                      <option value="">Keep current assignee</option>
                      {options.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name || user.email}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            {bulkAssignMessage && (
              <p className="mt-3 text-xs text-slate-500" role="status" aria-live="polite">
                {bulkAssignMessage}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setIsBulkAssignOpen(false)} className={subtleButtonClass} disabled={bulkAssignSaving}>
                Cancel
              </button>
              <button onClick={handleApplyBulkAssignee} className={primaryButtonClass} disabled={bulkAssignSaving}>
                {bulkAssignSaving ? 'Applying...' : 'Apply Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSummaryExportOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-900/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl p-5">
            <h3 className="text-base font-semibold text-slate-900">Export Summary CSV</h3>
            <p className="text-xs text-slate-500 mt-1">
              Optional created-date range. Export includes country/module aggregates with signed-off, deployed, failed, and blocked counts.
            </p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Created from</label>
                <input type="date" className={fieldBaseClass} value={summaryDateFrom} onChange={(e) => setSummaryDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Created to</label>
                <input type="date" className={fieldBaseClass} value={summaryDateTo} onChange={(e) => setSummaryDateTo(e.target.value)} />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setIsSummaryExportOpen(false)} className={subtleButtonClass}>
                Cancel
              </button>
              <button onClick={exportSummaryCsv} className={primaryButtonClass}>
                Download Summary CSV
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        destructive={confirmDialog.destructive}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          const action = confirmDialog.onConfirm;
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          await action();
        }}
      />
    </div>
  );
};
