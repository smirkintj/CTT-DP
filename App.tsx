'use client';
import React, { useEffect, useState } from 'react';
import { signIn, getSession, useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Layout } from './components/Layout';
import { StakeholderDashboard } from './views/StakeholderDashboard';
import { AdminDashboard } from './views/AdminDashboard';
import { AdminTaskManagement } from './views/AdminTaskManagement';
import { AdminDatabase } from './views/AdminDatabase';
import { TaskDetail } from './views/TaskDetail';
import { ImportWizard } from './views/ImportWizard';
import { User, Task, Role, ViewState, CountryConfig } from './types';
import { INITIAL_COUNTRIES, INITIAL_MODULES } from './constants';

interface AppProps {
  initialView?: ViewState;
  initialSelectedTaskId?: string | null;
  onRouteChange?: (nextView: ViewState, taskId?: string | null) => void;
}

const App: React.FC<AppProps> = ({ initialView, initialSelectedTaskId = null, onRouteChange }) => {
  const router = useRouter();
  const { data: session, status } = useSession();

  // State Management
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<ViewState>(initialView ?? 'LOGIN');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialSelectedTaskId);

  // Global Lists of Values
  const [availableCountries, setAvailableCountries] = useState<CountryConfig[]>(INITIAL_COUNTRIES);
  const [availableModules, setAvailableModules] = useState<string[]>(INITIAL_MODULES);

  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session?.user) {
      setCurrentUser(null);
      setView('LOGIN');
      return;
    }

    const role = session.user.role === 'ADMIN' ? Role.ADMIN : Role.STAKEHOLDER;
    const user: User = {
      id: session.user.id,
      name: session.user.name || session.user.email || 'User',
      email: session.user.email || '',
      role,
      countryCode: session.user.countryCode || 'SG',
      avatarUrl: session.user.image || undefined
    };

    setCurrentUser(user);
    setView(initialView ?? (role === Role.ADMIN ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER'));
  }, [session, status, initialView]);

  useEffect(() => {
    if (!session?.user) {
      setTasks([]);
      return;
    }

    const loadTasks = async () => {
      const response = await fetch('/api/tasks', { cache: 'no-store' });
      if (!response.ok) {
        setTasks([]);
        return;
      }
      const data = await response.json();
      setTasks(data);
    };

    void loadTasks();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || !selectedTaskId) return;

    if (tasks.find((task) => task.id === selectedTaskId)) return;

    const loadTask = async () => {
      const response = await fetch(`/api/tasks/${selectedTaskId}`, { cache: 'no-store' });
      if (!response.ok) return;
      const task = await response.json();
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === task.id);
        return exists ? prev : [task, ...prev];
      });
    };

    void loadTask();
  }, [selectedTaskId, session?.user, tasks]);

  // Handlers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoginError(null);
    const result = await signIn('credentials', { email, password, redirect: false });

    if (!result || result.error) {
      setLoginError('Invalid email or password. Please try again.');
      return;
    }

    const updatedSession = await getSession();
    const role = updatedSession?.user?.role;

    if (role === 'ADMIN') {
      router.push('/admin/dashboard');
      return;
    }

    router.push('/');
  };

  const handleLogout = () => {
    void signOut({ redirect: false });
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
    setTasks(prev => {
      const exists = prev.some(t => t.id === updatedTask.id);
      if (!exists) return [updatedTask, ...prev];
      return prev.map(t => t.id === updatedTask.id ? updatedTask : t);
    });
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

                {loginError && (
                  <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                    {loginError}
                  </div>
                )}
                
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
                     Tip: Use your assigned account to sign in
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

      {view === 'TASK_DETAIL' && selectedTaskId && selectedTask && (
        <TaskDetail 
          task={selectedTask} 
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
