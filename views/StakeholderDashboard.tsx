'use client';
import React, { useEffect, useState } from 'react';
import { Task, Status } from '../types';
import { Badge } from '../components/Badge';
import { Search, ArrowRight, MessageSquare, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface StakeholderDashboardProps {
  tasks: Task[];
  loading: boolean;
  onSelectTask: (task: Task) => void;
  currentUserCountry: string;
  currentUserName: string;
  onOpenInbox: () => void;
}

const normalizeStatusKey = (status: string) => {
  if (!status) return 'UNKNOWN';
  return status.toString().trim().replace(/\s+/g, '_').toUpperCase();
};

const getStatusLabel = (statusKey: string) => {
  const labels: Record<string, string> = {
    READY: 'Ready',
    IN_PROGRESS: 'In Progress',
    PASSED: 'Passed',
    FAILED: 'Failed',
    BLOCKED: 'Blocked'
  };
  return labels[statusKey] ?? statusKey;
};

export const StakeholderDashboard: React.FC<StakeholderDashboardProps> = ({ tasks, loading, onSelectTask, currentUserCountry, currentUserName, onOpenInbox }) => {
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [activityFeed, setActivityFeed] = useState<Array<{ id: string; type: string; message: string; createdAt: string }>>([]);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [unreadComments, setUnreadComments] = useState(0);
  
  const myTasks = tasks.filter(t => t.countryCode === currentUserCountry);
  const statusFilteredTasks = filterStatus === 'ALL'
    ? myTasks
    : myTasks.filter((task) => {
        const statusKey = normalizeStatusKey(task.status as unknown as string);
        const isSignedOff = Boolean(task.signedOffAt || task.signedOff);
        if (filterStatus === 'IN_PROGRESS') {
          return statusKey === 'IN_PROGRESS' || statusKey === 'READY' || (statusKey === 'PASSED' && !isSignedOff);
        }
        if (filterStatus === 'PASSED') {
          return statusKey === 'PASSED' && isSignedOff;
        }
        return statusKey === filterStatus;
      });
  const filteredTasks = statusFilteredTasks.filter((task) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;
    return (
      task.title.toLowerCase().includes(query) ||
      task.featureModule.toLowerCase().includes(query) ||
      (task.description || '').toLowerCase().includes(query)
    );
  });
  
  // Calculate specific stats
  const pendingCount = myTasks.filter((task) => {
    const key = task.status?.toString().trim().replace(/\s+/g, '_').toUpperCase();
    const isSignedOff = Boolean(task.signedOffAt || task.signedOff);
    return key === 'READY' || key === 'PENDING' || key === 'IN_PROGRESS' || key === 'BLOCKED' || key === 'FAILED' || (key === 'PASSED' && !isSignedOff);
  }).length;
  const completedTasks = myTasks.filter((task) => {
    const key = task.status?.toString().trim().replace(/\s+/g, '_').toUpperCase();
    return key === 'DEPLOYED' || Boolean(task.signedOffAt || task.signedOff);
  }).length;
  const completionPercentage = myTasks.length > 0 ? Math.round((completedTasks / myTasks.length) * 100) : 0;

  // Identify blocked tasks for alert
  const blockedTasks = myTasks.filter(t => t.status === Status.BLOCKED);

  useEffect(() => {
    const key = `stakeholder-dashboard-ui:${currentUserCountry}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { filterStatus?: string; searchTerm?: string };
      if (typeof parsed.filterStatus === 'string') setFilterStatus(parsed.filterStatus);
      if (typeof parsed.searchTerm === 'string') setSearchTerm(parsed.searchTerm);
    } catch {
      // ignore malformed local state
    }
  }, [currentUserCountry]);

  useEffect(() => {
    const key = `stakeholder-dashboard-ui:${currentUserCountry}`;
    try {
      window.localStorage.setItem(key, JSON.stringify({ filterStatus, searchTerm }));
    } catch {
      // ignore storage write errors
    }
  }, [currentUserCountry, filterStatus, searchTerm]);

  useEffect(() => {
    const loadActivities = async () => {
      setLoadingActivity(true);
      const response = await fetch('/api/activities', { cache: 'no-store' });
      if (!response.ok) {
        setLoadingActivity(false);
        return;
      }

      const data = await response.json();
      if (Array.isArray(data)) {
        setActivityFeed(data.slice(0, 5));
      } else {
        setActivityFeed([]);
      }
      setLoadingActivity(false);
    };

    void loadActivities();
  }, []);

  useEffect(() => {
    const loadUnreadCount = async () => {
      const response = await fetch('/api/comments/unread-count', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      setUnreadComments(typeof data?.count === 'number' ? data.count : 0);
    };
    void loadUnreadCount();
  }, [myTasks.length]);

  const formatTimeAgo = (isoDate: string) => {
    const time = new Date(isoDate).getTime();
    if (Number.isNaN(time)) return '';
    const seconds = Math.floor((Date.now() - time) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const formatDateOnly = (value?: string) => {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
  };

  const getAssigneeName = (task: Task) => {
    if (task.assignee?.name) return task.assignee.name;
    if (task.assignee?.email) return task.assignee.email;
    return task.assigneeId ? task.assigneeId : 'Unassigned';
  };

  const getAssigneeAvatar = (task: Task) => {
    return task.assignee?.avatarUrl;
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic Task Blocked Alert */}
      {blockedTasks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 animate-fade-in shadow-sm">
           <AlertCircle className="text-amber-600 mt-0.5 flex-shrink-0" size={24} />
           <div>
              <h3 className="font-bold text-sm text-amber-900">Attention Needed: Testing Halted for {blockedTasks.length} Tasks</h3>
              <p className="text-amber-800 text-sm mt-1 mb-2">The following tasks are currently blocked. Please focus on other scenarios.</p>
              <ul className="list-disc list-inside text-xs text-amber-700 space-y-1">
                 {blockedTasks.map(t => (
                   <li key={t.id}><span className="font-semibold">{t.featureModule}:</span> {t.title} {t.blockReason ? `(${t.blockReason})` : ''}</li>
                 ))}
              </ul>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Column: Tasks & Filters */}
        <div className="lg:col-span-3 space-y-8">
          
          {/* Welcome Section */}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Hello, {currentUserName || 'User'}</h1>
            <p className="text-slate-500 mt-1">Here is the testing progress for {currentUserCountry}.</p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Progress Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wide">Progress</span>
                    <CheckCircle size={20} className="text-brand-600"/>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">{completionPercentage}%</span>
                    <span className="text-xs text-slate-400">completed</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div className="bg-brand-500 h-1.5 rounded-full" style={{ width: `${completionPercentage}%` }}></div>
                </div>
            </div>

            {/* Open Tasks Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-medium text-slate-500 uppercase tracking-wide">Open Tasks</span>
                    <Clock size={20} className="text-blue-500"/>
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-slate-900">{pendingCount}</span>
                    <span className="text-xs text-slate-400">remaining</span>
                </div>
              </div>

            {/* Unread Comments Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-8 -mt-8 z-0"></div>
                <div className="relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-slate-500 uppercase tracking-wide">Unread</span>
                        <MessageSquare size={20} className="text-purple-600"/>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-purple-900">{unreadComments}</span>
                        <span className="text-xs text-purple-600 font-medium">new comments</span>
                    </div>
                    <button onClick={onOpenInbox} className="text-xs text-purple-700 hover:text-purple-900 font-medium mt-3 flex items-center gap-1">
                        View Discussions <ArrowRight size={12}/>
                    </button>
                </div>
            </div>
          </div>

          {/* Main Task List */}
          <div>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-2 rounded-lg border border-slate-200 shadow-sm mb-6">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-md overflow-x-auto max-w-full">
                {['ALL', 'IN_PROGRESS', 'PASSED', 'BLOCKED', 'FAILED'].map((statusKey) => (
                  <button
                    key={statusKey}
                    onClick={() => setFilterStatus(statusKey)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition-all ${
                      filterStatus === statusKey ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {statusKey === 'ALL' ? 'All' : getStatusLabel(statusKey)}
                  </button>
                ))}
              </div>
              
              <div className="relative mt-2 sm:mt-0 w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Search tasks..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border-none bg-transparent focus:ring-0 placeholder-slate-400 text-slate-800"
                />
              </div>
            </div>

            {/* Grid View */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {loading && filteredTasks.length === 0 ? (
                <div className="col-span-full text-center py-20 bg-white rounded-xl border border-slate-200">
                  <p className="text-slate-400">Loading tasks...</p>
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="col-span-full text-center py-20 bg-white rounded-xl border border-dashed border-slate-200">
                  <p className="text-slate-400">No tasks found matching your filters.</p>
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div 
                    key={task.id}
                    onClick={() => onSelectTask(task)}
                    className="group bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-brand-200 transition-all cursor-pointer relative overflow-hidden flex flex-col h-full"
                  >
                    {/* Status Strip */}
                    <div className={`absolute top-0 left-0 right-0 h-1 ${
                      task.status === Status.PASSED ? 'bg-emerald-500' :
                      task.status === Status.FAILED ? 'bg-rose-500' :
                      task.status === Status.BLOCKED ? 'bg-amber-500' :
                      task.status === Status.IN_PROGRESS ? 'bg-blue-500' :
                      'bg-slate-300'
                    }`} />

                    <div className="flex justify-between items-start mb-3 pt-2">
                       <Badge type="module" value={task.featureModule} />
                       <Badge type="status" value={task.status} />
                    </div>

                    <h3 className="text-lg font-semibold text-slate-900 group-hover:text-brand-600 transition-colors mb-2 line-clamp-2">
                      {task.title}
                    </h3>
                    <p className="text-slate-500 text-sm line-clamp-2 mb-4 flex-1">{task.description}</p>

                    <div className="border-t border-slate-100 pt-3 mt-auto flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          {getAssigneeAvatar(task) ? (
                            <img src={getAssigneeAvatar(task)} alt="Assignee" className="w-6 h-6 rounded-full border border-slate-200"/>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-500">?</div>
                          )}
                          <span className="text-xs text-slate-600 font-medium">{getAssigneeName(task)}</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-500">Due: {formatDateOnly(task.dueDate)}</span>
                          {(task.commentCount ?? (task.steps ?? []).reduce((acc, step) => acc + (step.comments?.length ?? 0), 0)) > 0 && (
                             <span className="flex items-center text-xs text-slate-400 gap-1">
                               <MessageSquare size={12}/> {task.commentCount ?? (task.steps ?? []).reduce((acc, step) => acc + (step.comments?.length ?? 0), 0)}
                             </span>
                          )}
                          <Badge type="priority" value={task.priority} />
                       </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Activity Feed (Desktop) */}
        <div className="hidden lg:block space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sticky top-24">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Recent Activity</h3>
            
            <div className="space-y-6">
              {loadingActivity ? (
                <p className="text-sm text-slate-400">Loading activity...</p>
              ) : activityFeed.length === 0 ? (
                <p className="text-sm text-slate-400">No recent activity.</p>
              ) : (
                activityFeed.map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="mt-0.5 min-w-[24px]">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          activity.type === 'STATUS_CHANGED' ? 'bg-rose-100 text-rose-600' :
                          activity.type === 'SIGNED_OFF' || activity.type === 'DEPLOYED' ? 'bg-emerald-100 text-emerald-600' :
                          activity.type === 'COMMENT_ADDED' ? 'bg-blue-100 text-blue-600' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {activity.type === 'STATUS_CHANGED' ? '!' : 'i'}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm text-slate-700 leading-snug">{activity.message}</p>
                        <span className="text-xs text-slate-400 block mt-1">{formatTimeAgo(activity.createdAt)}</span>
                      </div>
                    </div>
                ))
              )}
              
              <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase mb-2">Helpful Links</h4>
                  <ul className="space-y-2">
                    <li><a href="#" className="text-sm text-brand-600 hover:underline">UAT Guidelines PDF</a></li>
                    <li><a href="#" className="text-sm text-brand-600 hover:underline">Report a System Bug</a></li>
                    <li><a href="#" className="text-sm text-brand-600 hover:underline">Contact Admin</a></li>
                  </ul>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
