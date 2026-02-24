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
import { InboxView } from './views/InboxView';
import { User, Task, Role, ViewState, CountryConfig } from './types';
import { INITIAL_COUNTRIES, INITIAL_MODULES } from './constants';
import { apiFetch } from './lib/http';
import { notify } from './lib/notify';

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
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [view, setView] = useState<ViewState>(initialView ?? 'LOGIN');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialSelectedTaskId);

  // Global Lists of Values
  const [availableCountries, setAvailableCountries] = useState<CountryConfig[]>(INITIAL_COUNTRIES);
  const [availableModules, setAvailableModules] = useState<string[]>(INITIAL_MODULES);

  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const savedEmail = window.localStorage.getItem('ctt_saved_email');
    const savedRemember = window.localStorage.getItem('ctt_remember_me');
    if (savedRemember === 'false') {
      setRememberMe(false);
      return;
    }
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

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
      setLoadingTasks(true);
      try {
        const data = await apiFetch<any[]>('/api/tasks', { cache: 'no-store' });
        const mappedTasks = Array.isArray(data)
          ? data.map((task: any) => ({
              ...task,
              featureModule: task.featureModule ?? task.module ?? 'General'
            }))
          : [];
        setTasks(mappedTasks);
      } catch {
        notify('Failed to load tasks', 'error');
      } finally {
        setLoadingTasks(false);
      }
    };

    void loadTasks();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user || session.user.role !== 'ADMIN') return;

    const loadAdminMetadata = async () => {
      try {
        const [countries, modules] = await Promise.all([
          apiFetch<any[]>('/api/admin/countries', { cache: 'no-store' }),
          apiFetch<string[]>('/api/admin/modules', { cache: 'no-store' })
        ]);
        if (Array.isArray(countries)) setAvailableCountries(countries);
        if (Array.isArray(modules)) setAvailableModules(modules);
      } catch {
        notify('Failed to load admin metadata', 'error');
      }
    };

    void loadAdminMetadata();
  }, [session?.user?.id, session?.user?.role]);

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

    if (typeof window !== 'undefined') {
      if (rememberMe) {
        window.localStorage.setItem('ctt_saved_email', email.trim());
        window.localStorage.setItem('ctt_remember_me', 'true');
      } else {
        window.localStorage.removeItem('ctt_saved_email');
        window.localStorage.setItem('ctt_remember_me', 'false');
      }
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

  const handleTaskDelete = (taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
    setSelectedTaskId((prev) => (prev === taskId ? null : prev));
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
      <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="bg-white p-8 shadow-xl border border-slate-200 rounded-2xl">
             <div className="text-center mb-8">
               <div className="flex justify-center mb-5">
                  <div className="h-12 w-auto px-4 bg-brand-500 rounded-xl flex items-center justify-center shadow-md">
                     <span className="text-white font-bold text-2xl tracking-wider">CTT</span>
                  </div>
               </div>
               <p className="mt-2 text-sm text-slate-500 font-medium">
                 Cuba Try Test - UAT Management
               </p>
             </div>

             <form className="space-y-6" onSubmit={handleLoginSubmit}>
                <div>
                   <label className="block text-sm font-medium text-slate-700">Email address</label>
                   <input 
                     type="text" 
                     autoComplete="username"
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
                     autoComplete="current-password"
                     className="mt-1 appearance-none block w-full px-3 py-2 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-brand-500 focus:border-brand-500 sm:text-sm" 
                     placeholder="••••••••"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                   />
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Remember email on this device
                </label>

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
          </div>
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
          loading={loadingTasks}
          onSelectTask={handleTaskSelect}
          currentUserCountry={currentUser.countryCode}
          currentUserName={currentUser.name}
          onOpenInbox={() => handleNavigation('INBOX')}
        />
      )}
      
      {view === 'DASHBOARD_ADMIN' && (
        <AdminDashboard 
          tasks={tasks} 
          loading={loadingTasks}
          onSelectTask={handleTaskSelect}
          onManageTasks={() => handleNavigation('ADMIN_TASK_MANAGEMENT')}
          currentUser={currentUser}
        />
      )}

      {view === 'ADMIN_TASK_MANAGEMENT' && (
        <AdminTaskManagement 
          tasks={tasks}
          loading={loadingTasks}
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
          onDeleteTask={handleTaskDelete}
        />
      )}

      {view === 'IMPORT_WIZARD' && (
        <ImportWizard />
      )}

      {view === 'INBOX' && (
        <InboxView
          onOpenTask={handleTaskSelect}
          onBack={() => handleNavigation(currentUser.role === Role.ADMIN ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER')}
        />
      )}
    </Layout>
  );
};

export default App;
