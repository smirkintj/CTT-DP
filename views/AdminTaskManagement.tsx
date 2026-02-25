'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { Task, Priority, TestStep, TargetSystem, CountryConfig } from '../types';
import { Badge } from '../components/Badge';
import { Trash2, Plus, UploadCloud, Search, Filter, X, Save, Globe } from 'lucide-react';
import { apiFetch } from '../lib/http';
import { notify } from '../lib/notify';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass, textareaBaseClass } from '../components/ui/formClasses';

interface AdminTaskManagementProps {
  tasks: Task[];
  loading: boolean;
  onImport: () => void;
  onEdit: (task: Task) => void;
  onAddTask: (tasks: Task[]) => void;
  availableCountries: CountryConfig[];
  availableModules: string[];
}

export const AdminTaskManagement: React.FC<AdminTaskManagementProps> = ({ 
    tasks, 
    loading,
    onImport, 
    onEdit, 
    onAddTask,
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
      const confirmed = window.confirm('You have unsaved task inputs. Discard them?');
      if (!confirmed) return;
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
     const invalidJira = jiraTicket.length > 0 && !/^(EO-\d+|\d+)$/i.test(jiraTicket);
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
       setCreateError('Jira ticket must be numeric or in EO-1234 format.');
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
           jiraTicket: newTask.jiraTicket,
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
             onClick={onImport}
             className={`${subtleButtonClass} shadow-sm flex items-center gap-2`}
           >
             <UploadCloud size={16}/> Import Excel
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
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
               <input 
                 type="text" 
                 className={`w-full pl-9 pr-4 py-2 ${fieldBaseClass}`} 
                 placeholder="Search tasks..."
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
            </div>
            <div className="flex items-center gap-2">
              <select
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
              >
                 <Filter size={18} />
              </button>
            </div>
         </div>

         {isFilterOpen && (
           <div className="p-4 border-b border-slate-200 bg-white">
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
               <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                  <tr>
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
                      <td colSpan={8} className="px-6 py-10 text-center text-slate-500">
                        Loading tasks...
                      </td>
                    </tr>
                  ) : filteredTasks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-10 text-center text-slate-400">
                        No tasks found.
                      </td>
                    </tr>
                  ) : (
                    filteredTasks.map(task => (
                      <tr key={task.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => onEdit(task)}>
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
                   <button onClick={closeCreateModal} className="text-slate-400 hover:text-slate-600">
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
                                      <button onClick={() => removeStepRow(idx)} className="text-slate-400 hover:text-red-500">
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
    </div>
  );
};
