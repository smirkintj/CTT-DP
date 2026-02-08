import React from 'react';
import { Task, Status, Priority } from '../types';
import { Badge } from '../components/Badge';
import { AlertTriangle, TrendingUp, Clock, MessageSquare, ArrowRight, XCircle } from 'lucide-react';

interface AdminDashboardProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  onManageTasks: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ tasks, onSelectTask, onManageTasks }) => {
  
  // KPI Calculations
  const totalTasks = tasks.length;
  const passed = tasks.filter(t => t.status === Status.PASSED || t.status === Status.DEPLOYED).length;
  const progress = Math.round((passed / totalTasks) * 100) || 0;
  
  const openUat = tasks.filter(t => t.status === Status.PENDING || t.status === Status.IN_PROGRESS).length;
  const blockers = tasks.filter(t => t.status === Status.BLOCKED || t.status === Status.FAILED).length;
  const unreadComments = Math.round(tasks.reduce((acc, t) => acc + t.steps.reduce((sAcc, s) => sAcc + s.comments.length, 0), 0) * 0.3);

  // Filter recent tasks to show attention items first (Blocked/Failed, then Open)
  const recentTasks = [...tasks].sort((a, b) => {
      const score = (status: Status) => {
          if (status === Status.BLOCKED || status === Status.FAILED) return 3;
          if (status === Status.IN_PROGRESS) return 2;
          if (status === Status.PENDING) return 1;
          return 0;
      };
      return score(b.status) - score(a.status);
  }).slice(0, 5);

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
             onClick={onManageTasks}
             className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 shadow-sm"
           >
             Manage Tasks
           </button>
           <button 
             onClick={onManageTasks} // Redirect to manage for now to open create modal there
             className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 shadow-sm flex items-center gap-2"
           >
             + New Task
           </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         {/* Overall Progress */}
         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 text-sm font-medium">Overall Progress</span>
              <TrendingUp size={20} className="text-brand-600"/>
            </div>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold text-slate-900">{progress}%</span>
              <span className="text-xs text-slate-400 mb-1">completion</span>
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
            <p className="text-xs text-slate-400 mt-2">Pending or In Progress</p>
         </div>

         {/* Blockers */}
         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 text-sm font-medium">Blockers / Failed</span>
              <AlertTriangle size={20} className="text-amber-500"/>
            </div>
            <span className={`text-3xl font-bold ${blockers > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{blockers}</span>
            <p className="text-xs text-slate-400 mt-2">Requires attention</p>
         </div>

         {/* Unread Comments */}
         <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <span className="text-slate-500 text-sm font-medium">Unread Comments</span>
              <MessageSquare size={20} className="text-purple-500"/>
            </div>
            <span className="text-3xl font-bold text-slate-900">{unreadComments}</span>
            <p className="text-xs text-slate-400 mt-2">From stakeholders</p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Recent Testing Tasks (Card View - Focused on Attention Items) */}
        <div className="lg:col-span-2 space-y-6">
           <div className="flex justify-between items-center">
             <h3 className="font-bold text-slate-900">Priority Tasks (Open & Issues)</h3>
             <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">Sorted by Urgency</span>
           </div>
           
           <div className="space-y-4">
             {recentTasks.map(task => (
                <div 
                  key={task.id} 
                  onClick={() => onSelectTask(task)}
                  className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm hover:border-brand-300 transition-all cursor-pointer group"
                >
                   <div className="flex justify-between items-start">
                      <div className="space-y-1">
                         <div className="flex items-center gap-2">
                            <Badge type="module" value={task.featureModule} />
                            <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full">{task.countryCode}</span>
                         </div>
                         <h4 className="font-semibold text-slate-900 group-hover:text-brand-600">{task.title}</h4>
                         <p className="text-sm text-slate-500 line-clamp-1">{task.description}</p>
                      </div>
                      <Badge type="status" value={task.status} />
                   </div>
                   
                   <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                         <span>Assignee: <strong>{task.assignee?.name || task.assignee?.email || task.assigneeId || 'Unassigned'}</strong></span>
                         <span>Due: {task.dueDate}</span>
                      </div>
                      <ArrowRight size={18} className="text-slate-300 group-hover:text-brand-500" />
                   </div>
                </div>
             ))}
           </div>
           
           <button onClick={onManageTasks} className="w-full py-3 text-sm text-slate-500 font-medium hover:text-brand-600 hover:bg-slate-50 border border-dashed border-slate-200 rounded-xl transition-colors">
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
                 {tasks.filter(t => t.status === Status.FAILED || t.status === Status.BLOCKED).length === 0 ? (
                   <p className="text-sm text-slate-400">No critical issues found.</p>
                 ) : (
                   tasks.filter(t => t.status === Status.FAILED || t.status === Status.BLOCKED).map(t => (
                     <div key={t.id} onClick={() => onSelectTask(t)} className="flex items-start gap-3 p-3 bg-red-50/50 rounded-lg border border-red-100 hover:bg-red-50 cursor-pointer transition-colors">
                        <XCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0"/>
                        <div>
                           <p className="text-xs font-bold text-red-800 line-clamp-1">{t.title}</p>
                           <p className="text-[10px] text-red-600 mt-0.5">{t.countryCode} • {t.status}</p>
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
