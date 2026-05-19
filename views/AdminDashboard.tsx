'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Task, Role } from '../types';
import { Badge } from '../components/Badge';
import { AlertTriangle, TrendingUp, Clock, MessageSquare, ArrowRight, XCircle } from 'lucide-react';
import { apiFetch } from '../lib/http';

interface AdminDashboardProps {}

const normalizeStatusKey = (status: string) => {
  if (!status) return 'UNKNOWN';
  return status.toString().trim().replace(/\s+/g, '_').toUpperCase();
};

const statusLabelMap: Record<string, string> = {
  READY: 'Ready',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
  DEPLOYED: 'Deployed',
  BLOCKED: 'Blocked',
  PENDING: 'Pending',
  DRAFT: 'Draft'
};

const getStatusLabel = (status: string) => {
  const key = normalizeStatusKey(status);
  return statusLabelMap[key] ?? status;
};

const normalizePriorityKey = (priority: string) => {
  if (!priority) return 'UNKNOWN';
  return priority.toString().trim().replace(/\s+/g, '_').toUpperCase();
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const getSignedOffDate = (task: Task) => {
  const value = task.signedOffAt || task.signedOff?.signedAt;
  return value ? formatDate(value) : null;
};

const getSignedOffByLabel = (task: Task) => {
  return task.signedOffBy?.name || task.signedOffBy?.email || task.signedOff?.signedBy || null;
};

const isTaskCompleted = (task: Task) => {
  const statusKey = normalizeStatusKey(task.status as unknown as string);
  return statusKey === 'DEPLOYED' || Boolean(task.signedOffAt || task.signedOff?.signedAt);
};

const isTaskOverdue = (task: Task) => {
  if (isTaskCompleted(task) || !task.dueDate) return false;
  const dueTime = new Date(task.dueDate).getTime();
  if (Number.isNaN(dueTime)) return false;
  return dueTime < Date.now();
};

const hasConditionalStep = (task: Task) => {
  return (task.steps ?? []).some((step) => step.stepResult === 'CONDITIONAL');
};

const countryBadgeClassMap: Record<string, string> = {
  SG: 'bg-cyan-100 text-cyan-800',
  MY: 'bg-blue-100 text-blue-800',
  TH: 'bg-pink-100 text-pink-800',
  VN: 'bg-amber-100 text-amber-800',
  HK: 'bg-rose-100 text-rose-800',
  TW: 'bg-emerald-100 text-emerald-800',
  ID: 'bg-orange-100 text-orange-800',
  PH: 'bg-violet-100 text-violet-800',
  AU: 'bg-indigo-100 text-indigo-800',
  NZ: 'bg-lime-100 text-lime-800'
};

const getCountryBadgeClass = (countryCode?: string) =>
  countryBadgeClassMap[countryCode || ''] ?? 'bg-slate-100 text-slate-700';

const getTaskAccent = (task: Task) => {
  if (isTaskOverdue(task)) {
    return {
      cardClass: 'border-rose-200',
      barClass: 'bg-rose-500',
      dueDateClass: 'text-rose-700 font-semibold'
    };
  }

  const statusKey = normalizeStatusKey(task.status as unknown as string);
  if (statusKey === 'PASSED' || statusKey === 'DEPLOYED' || Boolean(task.signedOffAt || task.signedOff?.signedAt)) {
    return {
      cardClass: 'border-emerald-200',
      barClass: 'bg-emerald-500',
      dueDateClass: 'text-emerald-700 font-semibold'
    };
  }

  return {
    cardClass: 'border-slate-200',
    barClass: 'bg-transparent',
    dueDateClass: 'text-slate-500'
  };
};

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'status'>('dueDate');
  const [unreadComments, setUnreadComments] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<any[]>('/api/tasks', { cache: 'no-store' })
      .then((data) => { if (active && Array.isArray(data)) setTasks(data as Task[]); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // KPI Calculations
  const totalSteps = tasks.reduce((acc, task) => acc + (task.steps?.length ?? 0), 0);
  const passedSteps = tasks.reduce(
    (acc, task) => acc + (task.steps ?? []).filter((step) => step.isPassed === true).length,
    0
  );
  const passedTasks = tasks.filter((task) => {
    const statusKey = normalizeStatusKey(task.status as unknown as string);
    return statusKey === 'PASSED' || statusKey === 'DEPLOYED';
  }).length;
  const progress =
    totalSteps > 0
      ? Math.round((passedSteps / totalSteps) * 100)
      : tasks.length > 0
        ? Math.round((passedTasks / tasks.length) * 100)
        : 0;
  
  const openUat = tasks.filter(t => {
    const statusKey = normalizeStatusKey(t.status as unknown as string);
    return statusKey === 'READY' || statusKey === 'PENDING' || statusKey === 'IN_PROGRESS' || statusKey === 'BLOCKED' || statusKey === 'FAILED';
  }).length;
  const blockers = tasks.filter(t => {
    const statusKey = normalizeStatusKey(t.status as unknown as string);
    return statusKey === 'BLOCKED' || statusKey === 'FAILED';
  }).length;
  useEffect(() => {
    const loadUnreadCount = async () => {
      const response = await fetch('/api/comments/unread-count', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setUnreadComments(typeof data?.count === 'number' ? data.count : 0);
    };
    void loadUnreadCount();
  }, []);

  const isLoading = loading && tasks.length === 0;

  const statusOptions = [
    { value: 'ALL', label: 'All Statuses' },
    { value: 'READY', label: 'Ready' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'PASSED', label: 'Passed' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'DEPLOYED', label: 'Deployed' },
    { value: 'BLOCKED', label: 'Blocked' }
  ];

  const priorityOptions = [
    { value: 'ALL', label: 'All Priorities' },
    { value: 'HIGH', label: 'High' },
    { value: 'MEDIUM', label: 'Medium' },
    { value: 'LOW', label: 'Low' },
    { value: 'CRITICAL', label: 'Critical' }
  ];

  const sortedTasks = useMemo(() => {
    const filtered = tasks.filter(t => {
      const statusKey = normalizeStatusKey(t.status as unknown as string);
      const priorityKey = normalizePriorityKey(t.priority as unknown as string);
      const statusOk = statusFilter === 'ALL' || statusKey === statusFilter;
      const priorityOk = priorityFilter === 'ALL' || priorityKey === priorityFilter;
      return statusOk && priorityOk;
    });

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

    const sorted = [...filtered].sort((a, b) => {
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
      return toTime(a.dueDate) - toTime(b.dueDate);
    });

    return sorted;
  }, [tasks, statusFilter, priorityFilter, sortBy]);

  const recentTasks = sortedTasks.slice(0, 5);

  return (
    <div className="space-y-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
           <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Dashboard</h1>
           <p className="text-slate-500">Monitor overall progress and address blockers.</p>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={() => router.push('/admin/tasks')} // Redirect to manage for now to open create modal there
             className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 shadow-sm flex items-center gap-2"
           >
             + New Task
           </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         {isLoading ? (
           Array.from({ length: 4 }).map((_, idx) => (
             <div key={idx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-pulse">
               <div className="flex justify-between items-start mb-4">
                 <div className="h-4 w-28 bg-slate-100 rounded"></div>
                 <div className="h-5 w-5 bg-slate-100 rounded"></div>
               </div>
               <div className="h-8 w-16 bg-slate-100 rounded"></div>
               <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3"></div>
             </div>
           ))
         ) : (
           <>
             {/* Overall Progress */}
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-slate-500 text-sm font-medium">Overall Progress</span>
                  <TrendingUp size={20} className="text-brand-600"/>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-slate-900">{progress}%</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
                   <div className="bg-brand-600 h-1.5 rounded-full" style={{width: `${progress}%`}}></div>
                </div>
             </div>

             {/* Open UAT */}
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-slate-500 text-sm font-medium">Open UAT Tasks</span>
                  <Clock size={20} className="text-blue-500"/>
                </div>
                <span className="text-3xl font-bold text-slate-900">{openUat}</span>
             </div>

             {/* Blockers */}
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-slate-500 text-sm font-medium">Blockers / Failed</span>
                  <AlertTriangle size={20} className="text-amber-500"/>
                </div>
                <span className={`text-3xl font-bold ${blockers > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{blockers}</span>
             </div>

             {/* Unread Comments */}
             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <span className="text-slate-500 text-sm font-medium">Unread Comments</span>
                  <MessageSquare size={20} className="text-purple-500"/>
                </div>
                <span className="text-3xl font-bold text-slate-900">{unreadComments}</span>
             </div>
           </>
         )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Recent Testing Tasks (Card View - Focused on Attention Items) */}
        <div className="lg:col-span-2 space-y-6">
           <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
             <h3 className="font-bold text-slate-900">Priority Tasks (Open & Issues)</h3>
             <div className="flex flex-wrap gap-2 text-xs">
               <select
                 className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600"
                 value={statusFilter}
                 onChange={(e) => setStatusFilter(e.target.value)}
               >
                 {statusOptions.map(option => (
                   <option key={option.value} value={option.value}>{option.label}</option>
                 ))}
               </select>
               <select
                 className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600"
                 value={priorityFilter}
                 onChange={(e) => setPriorityFilter(e.target.value)}
               >
                 {priorityOptions.map(option => (
                   <option key={option.value} value={option.value}>{option.label}</option>
                 ))}
               </select>
               <select
                 className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-600"
                 value={sortBy}
                 onChange={(e) => setSortBy(e.target.value as 'dueDate' | 'priority' | 'status')}
               >
                 <option value="dueDate">Sort: Due date</option>
                 <option value="priority">Sort: Priority</option>
                 <option value="status">Sort: Status</option>
               </select>
             </div>
           </div>
           
           <div className="space-y-4">
             {isLoading && recentTasks.length === 0 ? (
               <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm text-sm text-slate-500">
                 Loading tasks...
               </div>
             ) : (
               recentTasks.map(task => {
                 const accent = getTaskAccent(task);
                 return (
                 <div
                   key={task.id}
                   onClick={() => router.push(`/tasks/${task.id}`)}
                   className={`relative overflow-hidden bg-white rounded-xl p-4 border shadow-sm hover:border-brand-300 transition-all cursor-pointer group ${accent.cardClass}`}
                 >
                   <div className={`absolute top-0 left-0 right-0 h-1 ${accent.barClass}`} />
                   <div className="flex justify-between items-start gap-3">
                     <div className="min-w-0">
                       <h4 className="font-semibold text-slate-900 group-hover:text-brand-600 line-clamp-1">{task.title}</h4>
                       <p className="text-sm text-slate-500 line-clamp-1 mt-0.5">{task.description}</p>
                     </div>
                     <Badge type="status" value={task.status} />
                   </div>

                   <div className="mt-3 flex items-center gap-2 flex-wrap">
                     <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] ${getCountryBadgeClass(task.countryCode)}`}>
                       {task.countryCode}
                     </span>
                     <Badge type="product" value={task.productName || 'EasyOrder'} />
                     <Badge type="module" value={task.featureModule} />
                     {hasConditionalStep(task) && (
                       <span className="text-xs text-amber-700 font-semibold bg-amber-100 px-2 py-0.5 rounded-full">Conditional</span>
                     )}
                   </div>

                   <div className="mt-3 pt-3 border-t border-slate-100">
                     <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                       <span className="truncate">
                         Assignee: <strong>{task.assignee?.name || task.assignee?.email || task.assigneeId || 'Unassigned'}</strong>
                       </span>
                       <span className="inline-flex items-center gap-2 shrink-0">
                         <span className={accent.dueDateClass}>
                           Due: {formatDate(task.dueDate)}
                         </span>
                         <ArrowRight size={16} className="text-slate-300 group-hover:text-brand-500" />
                       </span>
                     </div>
                     {getSignedOffDate(task) && (
                       <div className="mt-2 text-xs text-emerald-700 font-medium">
                         Signed off on {getSignedOffDate(task)}
                         {getSignedOffByLabel(task) ? ` by ${getSignedOffByLabel(task)}` : ''}
                       </div>
                     )}
                   </div>
                 </div>
               )})
             )}
           </div>
           
           <button onClick={() => router.push('/admin/tasks')} className="w-full py-3 text-sm text-slate-500 font-medium hover:text-brand-600 hover:bg-slate-50 border border-dashed border-slate-200 rounded-xl transition-colors">
              View All Tasks
           </button>
        </div>

        {/* Priority / Blockers Sidebar */}
        <div className="space-y-6">
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                 <AlertTriangle size={18} className="text-amber-500"/> Critical Issues
              </h3>
              
              <div className="space-y-3">
                 {isLoading ? (
                   <p className="text-sm text-slate-400">Loading tasks...</p>
                 ) : tasks.filter(t => {
                   const statusKey = normalizeStatusKey(t.status as unknown as string);
                   return statusKey === 'FAILED' || statusKey === 'BLOCKED';
                 }).length === 0 ? (
                   <p className="text-sm text-slate-400">No critical issues found.</p>
                 ) : (
                   tasks.filter(t => {
                     const statusKey = normalizeStatusKey(t.status as unknown as string);
                     return statusKey === 'FAILED' || statusKey === 'BLOCKED';
                   }).map(t => (
                     <div key={t.id} onClick={() => router.push(`/tasks/${t.id}`)} className="flex items-start gap-3 p-3 bg-red-50/50 rounded-lg border border-red-100 hover:bg-red-50 cursor-pointer transition-colors">
                        <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0"/>
                        <div>
                           <p className="text-xs font-bold text-red-800 line-clamp-1">{t.title}</p>
                           <p className="text-[10px] text-red-600 mt-0.5">{t.productName || 'EasyOrder'} • {t.countryCode} • {getStatusLabel(t.status as unknown as string)}</p>
                        </div>
                     </div>
                   ))
                 )}
              </div>
           </div>
        </div>

      </div>
    </div>
  );
};
