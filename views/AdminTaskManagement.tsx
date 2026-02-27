'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Task, Priority, TestStep, TargetSystem, CountryConfig } from '../types';
import { Badge } from '../components/Badge';
import { Trash2, Plus, UploadCloud, Search, Filter, X, Save, Globe, Download } from 'lucide-react';
import { apiFetch } from '../lib/http';
import { notify } from '../lib/notify';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass, textareaBaseClass } from '../components/ui/formClasses';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { isValidDueDate, isValidJiraTicket, normalizeJiraTicketInput } from '../lib/taskValidation';

interface AdminTaskManagementProps {
  tasks: Task[];
  loading: boolean;
  onImport: () => void;
  onEdit: (task: Task) => void;
  onAddTask: (tasks: Task[]) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  availableCountries: CountryConfig[];
  availableModules: string[];
}

export const AdminTaskManagement: React.FC<AdminTaskManagementProps> = ({ 
    tasks, 
    loading,
    onImport, 
    onEdit, 
    onAddTask,
    onDeleteTasks,
    availableCountries,
    availableModules 
}) => {
  const [stakeholders, setStakeholders] = useState<Array<{ id: string; name: string; email: string; countryCode: string }>>([]);
  const [assigneeByCountry, setAssigneeByCountry] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
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
     jiraTicket: '',
     featureModule: 'Ordering',
     priority: Priority.MEDIUM,
     dueDate: '',
     scope: 'Local',
     targetSystem: 'Ordering Portal',
     crNumber: '',
  });
  const [creating, setCreating] = useState(false);
  const [createSaveState, setCreateSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [createError, setCreateError] = useState<string | null>(null);
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
  const [bulkStatus, setBulkStatus] = useState<'DRAFT' | 'READY' | 'IN_PROGRESS' | 'BLOCKED' | 'FAILED' | 'DEPLOYED'>('READY');
  const [isBulkAssignOpen, setIsBulkAssignOpen] = useState(false);
  const [bulkAssignSaving, setBulkAssignSaving] = useState(false);
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

  const defaultNewTask: Partial<Task> = {
    title: '',
    description: '',
    jiraTicket: '',
    featureModule: 'Ordering',
    priority: Priority.MEDIUM,
    dueDate: '',
    scope: 'Local',
    targetSystem: 'Ordering Portal',
    crNumber: '',
    developer: ''
  };
  const defaultSteps: Partial<TestStep>[] = [
    { id: '1', description: '', expectedResult: '', countryFilter: 'ALL', testData: '' }
  ];

  const resetCreateForm = () => {
    setNewTask(defaultNewTask);
    setSelectedCountries(['SG']);
    setAssigneeByCountry({});
    setSteps(defaultSteps);
    setCreateSaveState('idle');
    setCreateError(null);
  };

  const isCreateDirty =
    (newTask.title ?? '') !== (defaultNewTask.title ?? '') ||
    (newTask.description ?? '') !== (defaultNewTask.description ?? '') ||
    (newTask.jiraTicket ?? '') !== (defaultNewTask.jiraTicket ?? '') ||
    (newTask.featureModule ?? '') !== (defaultNewTask.featureModule ?? '') ||
    (newTask.priority ?? Priority.MEDIUM) !== (defaultNewTask.priority ?? Priority.MEDIUM) ||
    (newTask.dueDate ?? '') !== (defaultNewTask.dueDate ?? '') ||
    (newTask.targetSystem ?? 'Ordering Portal') !== (defaultNewTask.targetSystem ?? 'Ordering Portal') ||
    (newTask.crNumber ?? '') !== (defaultNewTask.crNumber ?? '') ||
    (newTask.developer ?? '') !== (defaultNewTask.developer ?? '') ||
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
    const loadStakeholders = async () => {
      try {
        const data = await apiFetch<Array<{ id: string; name: string; email: string; countryCode: string }>>(
          '/api/admin/stakeholders',
          { cache: 'no-store' }
        );
        if (Array.isArray(data)) setStakeholders(data);
      } catch {
        notify('Failed to load stakeholders', 'error');
      }
    };
    void loadStakeholders();
  }, []);

  useEffect(() => {
    if (stakeholders.length === 0) return;
    setAssigneeByCountry((prev) => {
      const next = { ...prev };
      for (const countryCode of selectedCountries) {
        if (!next[countryCode]) {
          const match = stakeholders.find((u) => u.countryCode === countryCode);
          if (match) next[countryCode] = match.id;
        }
      }
      return next;
    });
  }, [stakeholders, selectedCountries]);

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
            featureModule: task.featureModule ?? (task as any).module ?? 'General'
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
    setIsBulkStatusOpen(true);
  };

  const handleApplyBulkStatus = async () => {
    if (selectedTaskIds.length === 0 || bulkStatusSaving) return;
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id));
    const actionable = selectedTasks.filter((task) => !task.signedOffAt);
    if (actionable.length === 0) {
      notify('No editable tasks selected (signed-off tasks are locked).', 'error');
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
      notify(
        `Updated status for ${successCount} task(s).${failedCount > 0 ? ` ${failedCount} failed.` : ''}${lockedCount > 0 ? ` ${lockedCount} locked.` : ''}`,
        failedCount > 0 ? 'error' : 'success'
      );
    } else {
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
    notify(
      `Updated assignee for ${successCount}/${tasksToUpdate.length} task(s).`,
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

    const csv = [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ctt_tasks_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    notify('CSV exported.', 'success');
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
           jiraTicket: normalizedJira || undefined,
           featureModule: newTask.featureModule,
           module: newTask.featureModule,
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
       notify(error instanceof Error ? error.message : 'Failed to create tasks', 'error');
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

  return (
    <div className="space-y-6 animate-fade-in relative">
      <div className="flex justify-between items-center">
        <div>
           <h1 className="text-2xl font-bold text-slate-900">Task Management</h1>
           <p className="text-slate-500">Create, edit, and organize UAT scenarios.</p>
        </div>
        <div className="flex gap-2">
           <button
             onClick={openBulkStatusModal}
             disabled={selectedTaskIds.length === 0}
             className={`${subtleButtonClass} shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
           >
             Bulk Status ({selectedTaskIds.length})
           </button>
           <button
             onClick={openBulkAssignModal}
             disabled={selectedTaskIds.length === 0}
             className={`${subtleButtonClass} shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
           >
             Bulk Assign ({selectedTaskIds.length})
           </button>
           <button
             onClick={openGlobalEditModal}
             disabled={selectedTaskIds.length === 0}
             className={`${subtleButtonClass} shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
           >
             <Save size={16}/> Global Edit ({selectedTaskIds.length})
           </button>
           <button
             onClick={handleBulkDelete}
             disabled={selectedTaskIds.length === 0}
             className={`${subtleButtonClass} shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
           >
             <Trash2 size={16}/> Delete Selected ({selectedTaskIds.length})
           </button>
           <button 
             onClick={exportFilteredTasksCsv}
             className={`${subtleButtonClass} shadow-sm flex items-center gap-2`}
           >
             <Download size={16}/> Export CSV
           </button>
           <button 
             onClick={onImport}
             className={`${subtleButtonClass} shadow-sm flex items-center gap-2`}
           >
             <UploadCloud size={16}/> Import Steps
           </button>
           <button 
             onClick={() => {
               resetCreateForm();
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
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
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
         <div>
            <table className="w-full table-fixed text-sm text-left">
               <caption className="sr-only">Admin task management table</caption>
               <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
                     <th className="px-3 py-4 w-[4%]">
                       <input
                         type="checkbox"
                         checked={filteredTasks.length > 0 && selectedTaskIds.length === filteredTasks.length}
                         onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                         onClick={(e) => e.stopPropagation()}
                         aria-label="Select all visible tasks"
                       />
                     </th>
                     <th className="px-4 py-4 w-[22%]">Task</th>
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
                      <td colSpan={9} className="px-6 py-10 text-center text-slate-500">
                        Loading tasks...
                      </td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-10 text-center text-slate-400">
                        No tasks found.
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
                             aria-label={`Select task ${task.title}`}
                           />
                         </td>
                         <td className="px-4 py-4 font-medium text-slate-900 truncate" title={task.title}>{task.title}</td>
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
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          <label className="block text-sm font-medium text-slate-700 mb-1">Target System</label>
                          <select 
                             className={selectBaseClass}
                             value={newTask.targetSystem}
                             onChange={(e) => setNewTask({...newTask, targetSystem: e.target.value as TargetSystem})}
                          >
                             <option value="Ordering Portal">Ordering Portal</option>
                             <option value="Admin Portal">Admin Portal</option>
                          </select>
                       </div>
                   </div>

                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Jira Ticket (Optional)</label>
                      <input
                        type="text"
                        className={fieldBaseClass}
                        placeholder="e.g. UAT-123"
                        value={newTask.jiraTicket || ''}
                        onChange={(e) => setNewTask({ ...newTask, jiraTicket: e.target.value })}
                      />
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Module</label>
                         <select 
                            className={selectBaseClass}
                            value={newTask.featureModule}
                            onChange={(e) => setNewTask({...newTask, featureModule: e.target.value})}
                         >
                            {availableModules.map(m => <option key={m}>{m}</option>)}
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
                          const options = stakeholders.filter((u) => u.countryCode === countryCode);
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
                                      <input 
                                         placeholder="Input data..."
                                         className="w-full text-xs border-slate-300 rounded focus:ring-slate-500 focus:border-slate-500"
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
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl p-5">
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
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl p-5">
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
