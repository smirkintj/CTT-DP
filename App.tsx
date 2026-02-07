'use client';
import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { StakeholderDashboard } from './views/StakeholderDashboard';
import { AdminDashboard } from './views/AdminDashboard';
import { AdminTaskManagement } from './views/AdminTaskManagement';
import { AdminDatabase } from './views/AdminDatabase';
import { TaskDetail } from './views/TaskDetail';
import { ImportWizard } from './views/ImportWizard';
import { User, Task, Role, ViewState, CountryConfig } from './types';
import { MOCK_TASKS, MOCK_USERS, INITIAL_COUNTRIES, INITIAL_MODULES } from './constants';

interface AppProps {
  initialUser?: User | null;
  initialView?: ViewState;
  initialSelectedTaskId?: string | null;
  onRouteChange?: (nextView: ViewState, taskId?: string | null) => void;
}

const App: React.FC<AppProps> = ({ initialUser = null, initialView, initialSelectedTaskId = null, onRouteChange }) => {
  // State Management
  const [currentUser, setCurrentUser] = useState<User | null>(initialUser);
  const [tasks, setTasks] = useState<Task[]>(MOCK_TASKS);
  const [view, setView] = useState<ViewState>(
    initialView ?? (initialUser ? (initialUser.role === Role.ADMIN ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER') : 'LOGIN')
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialSelectedTaskId);

  // Global Lists of Values
  const [availableCountries, setAvailableCountries] = useState<CountryConfig[]>(INITIAL_COUNTRIES);
  const [availableModules, setAvailableModules] = useState<string[]>(INITIAL_MODULES);

  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Handlers
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    // Determine Role based on email pattern (Simulated logic)
    const isAdmin = email.toLowerCase().includes('admin');
    const role = isAdmin ? Role.ADMIN : Role.STAKEHOLDER;
    
    // Find mock user or create temp one
    let user = MOCK_USERS.find(u => u.role === role);
    if (!user) {
         user = {
            id: 'temp',
            name: email.split('@')[0],
            email: email,
            role: role,
            countryCode: 'SG',
            avatarUrl: 'https://picsum.photos/100/100'
         };
    }

    setCurrentUser(user);
    const nextView = role === Role.ADMIN ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER';
    setView(nextView);
    onRouteChange?.(nextView);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setView('LOGIN');
    setSelectedTaskId(null);
    setEmail('');
    setPassword('');
    onRouteChange?.('LOGIN');
  };

  const handleTaskSelect = (task: Task) => {
    setSelectedTaskId(task.id);
    setView('TASK_DETAIL');
    onRouteChange?.('TASK_DETAIL', task.id);
  };

  const handleTaskUpdate = (updatedTask: Task) => {
    setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
  };
  
  const handleAddTasks = (newTasks: Task[]) => {
    setTasks(prev => [...newTasks, ...prev]);
  };

  const handleNavigation = (targetView: ViewState) => {
    setView(targetView);
    if (targetView !== 'TASK_DETAIL') setSelectedTaskId(null);
    onRouteChange?.(targetView, targetView === 'TASK_DETAIL' ? selectedTaskId : null);
  };

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;

  // Render Login Screen if no user
  if (!currentUser || view === 'LOGIN') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
           <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-brand-500 rounded-xl flex items-center justify-center shadow-lg">
                 <span className="text-white font-bold text-2xl tracking-wider">CTT</span>
              </div>
           </div>
           <h2 className="text-center text-3xl font-extrabold text-slate-900 tracking-tight">
             CTT
           </h2>
           <p className="mt-2 text-center text-sm text-slate-500 font-medium">
             Cuba Try Test - UAT Management
           </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-10 px-6 shadow-xl border border-slate-100 sm:rounded-2xl">
             <form className="space-y-6" onSubmit={handleLoginSubmit}>
                <div>
                   <label className="block text-sm font-medium text-slate-700">Email address</label>
                   <input 
                     type="text" 
                     className="mt-1 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm" 
                     placeholder="user@dksh.com"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                   />
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700">Password</label>
                   <input 
                     type="password" 
                     className="mt-1 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm" 
                     placeholder="••••••••"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                   />
                </div>
                
                <div>
                   <button 
                     type="submit"
                     className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 transition-all"
                   >
                     Sign in
                   </button>
                </div>
             </form>

             <div className="mt-6">
               <div className="relative">
                 <div className="absolute inset-0 flex items-center">
                   <div className="w-full border-t border-slate-200" />
                 </div>
                 <div className="relative flex justify-center text-sm">
                   <span className="px-2 bg-white text-slate-500">
                     Tip: Use &apos;admin&apos; in email for Admin role
                   </span>
                 </div>
               </div>
             </div>
          </div>
          <p className="text-center text-xs text-slate-400 mt-6">&copy; 2023 Corporate IT Team</p>
        </div>
      </div>
    );
  }

  return (
    <Layout 
      currentUser={currentUser} 
      onLogout={handleLogout} 
      currentView={view} 
      onNavigate={handleNavigation}
    >
      {view === 'DASHBOARD_STAKEHOLDER' && (
        <StakeholderDashboard 
          tasks={tasks} 
          onSelectTask={handleTaskSelect}
          currentUserCountry={currentUser.countryCode} 
        />
      )}
      
      {view === 'DASHBOARD_ADMIN' && (
        <AdminDashboard 
          tasks={tasks} 
          onSelectTask={handleTaskSelect}
          onManageTasks={() => handleNavigation('ADMIN_TASK_MANAGEMENT')}
        />
      )}

      {view === 'ADMIN_TASK_MANAGEMENT' && (
        <AdminTaskManagement 
          tasks={tasks}
          onImport={() => handleNavigation('IMPORT_WIZARD')}
          onEdit={handleTaskSelect}
          onAddTask={handleAddTasks}
          availableCountries={availableCountries}
          availableModules={availableModules}
        />
      )}

      {view === 'ADMIN_DATABASE' && (
        <AdminDatabase 
           countries={availableCountries}
           modules={availableModules}
           onUpdateCountries={setAvailableCountries}
           onUpdateModules={setAvailableModules}
        />
      )}

      {view === 'TASK_DETAIL' && selectedTaskId && (
        <TaskDetail 
          task={selectedTask ?? tasks[0]} 
          currentUser={currentUser} 
          onBack={() => handleNavigation(currentUser.role === Role.ADMIN ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER')}
          onUpdateTask={handleTaskUpdate}
        />
      )}

      {view === 'IMPORT_WIZARD' && (
        <ImportWizard />
      )}
    </Layout>
  );
};

export default App;
