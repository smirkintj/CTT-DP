'use client';
import React, { useEffect, useState } from 'react';
import { signIn, getSession, useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Check, X } from 'lucide-react';
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
import { fieldBaseClass } from './components/ui/formClasses';

const TASK_CACHE_TTL_MS = 30_000;
const TASK_CACHE_KEY_PREFIX = 'ctt_tasks_cache_v1';

type CachedTasksPayload = {
  fetchedAt: number;
  tasks: Task[];
};

const getTaskCacheKey = (userId: string) => `${TASK_CACHE_KEY_PREFIX}:${userId}`;

const readCachedTasks = (userId?: string | null): CachedTasksPayload | null => {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getTaskCacheKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTasksPayload;
    if (!parsed || !Array.isArray(parsed.tasks) || typeof parsed.fetchedAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeCachedTasks = (userId: string, tasks: Task[]) => {
  if (typeof window === 'undefined') return;
  try {
    const payload: CachedTasksPayload = {
      fetchedAt: Date.now(),
      tasks
    };
    window.sessionStorage.setItem(getTaskCacheKey(userId), JSON.stringify(payload));
  } catch {
    // Ignore storage failures to avoid impacting core task fetch flow.
  }
};

interface AppProps {
  initialView?: ViewState;
  initialSelectedTaskId?: string | null;
  onRouteChange?: (nextView: ViewState, taskId?: string | null) => void;
}

const App: React.FC<AppProps> = ({ initialView, initialSelectedTaskId = null, onRouteChange }) => {
  const router = useRouter();
  const { data: session, status, update: updateSession } = useSession();
  const sessionUserId = session?.user?.id ?? null;

  // State Management
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [view, setView] = useState<ViewState>(initialView ?? 'LOGIN');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialSelectedTaskId);
  const [selectedStepOrder, setSelectedStepOrder] = useState<number | null>(null);

  // Global Lists of Values
  const [availableCountries, setAvailableCountries] = useState<CountryConfig[]>(INITIAL_COUNTRIES);
  const [availableModules, setAvailableModules] = useState<string[]>(INITIAL_MODULES);

  // Login Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [remainingLockSeconds, setRemainingLockSeconds] = useState(0);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isLocked = !!lockUntil && Date.now() < lockUntil;
  const mustChangePassword = Boolean(session?.user?.mustChangePassword);
  const passwordPolicyValid = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(newPasswordInput);
  const isReusingCurrentPassword =
    currentPasswordInput.length > 0 &&
    newPasswordInput.length > 0 &&
    currentPasswordInput === newPasswordInput;
  const passwordChecks = {
    minLength: newPasswordInput.length >= 8,
    uppercase: /[A-Z]/.test(newPasswordInput),
    lowercase: /[a-z]/.test(newPasswordInput),
    number: /\d/.test(newPasswordInput),
    symbol: /[^A-Za-z\d]/.test(newPasswordInput)
  };
  const confirmMatches = confirmPasswordInput.length > 0 && newPasswordInput === confirmPasswordInput;
  const [showCurrentPasswordModal, setShowCurrentPasswordModal] = useState(false);
  const [showNewPasswordModal, setShowNewPasswordModal] = useState(false);
  const [showConfirmPasswordModal, setShowConfirmPasswordModal] = useState(false);

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
    if (!email) {
      setLockUntil(null);
      setRemainingLockSeconds(0);
      return;
    }
    const key = `ctt_login_lock_${email.toLowerCase().trim()}`;
    const raw = window.localStorage.getItem(key);
    if (!raw) return;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= Date.now()) {
      window.localStorage.removeItem(key);
      return;
    }
    setLockUntil(until);
  }, [email]);

  useEffect(() => {
    if (!lockUntil) {
      setRemainingLockSeconds(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setRemainingLockSeconds(remaining);
      if (remaining === 0) {
        const key = `ctt_login_lock_${email.toLowerCase().trim()}`;
        window.localStorage.removeItem(key);
        setLockUntil(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lockUntil]);

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

    const userId = session.user.id;
    const cached = readCachedTasks(userId);
    if (cached) {
      setTasks(cached.tasks);
    }

    const isFreshCache = cached && Date.now() - cached.fetchedAt <= TASK_CACHE_TTL_MS;
    if (isFreshCache) {
      setLoadingTasks(false);
      return;
    }

    const controller = new AbortController();
    let active = true;

    const loadTasks = async () => {
      setLoadingTasks(true);
      try {
        const data = await apiFetch<any[]>('/api/tasks', {
          cache: 'no-store',
          signal: controller.signal
        });
        const mappedTasks = Array.isArray(data)
          ? data.map((task: any) => ({
              ...task,
              featureModule: task.featureModule ?? task.module ?? 'General'
            }))
          : [];
        if (!active) return;
        setTasks(mappedTasks);
        writeCachedTasks(userId, mappedTasks);
      } catch {
        if (!controller.signal.aborted && !cached) {
          notify('Failed to load tasks', 'error');
        }
      } finally {
        if (active) setLoadingTasks(false);
      }
    };

    void loadTasks();
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionUserId]);

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

  const hasSelectedTask = !!selectedTaskId && tasks.some((task) => task.id === selectedTaskId);

  useEffect(() => {
    if (!sessionUserId || !selectedTaskId || loadingTasks || hasSelectedTask) return;

    const loadTask = async () => {
      try {
        const task = await apiFetch<Task>(`/api/tasks/${selectedTaskId}`, { cache: 'no-store' });
        setTasks((prev) => {
          const exists = prev.some((t) => t.id === task.id);
          const next = exists ? prev : [task, ...prev];
          writeCachedTasks(sessionUserId, next);
          return next;
        });
      } catch {
        // Ignore detail prefetch failures; page-level handlers will surface actionable errors.
      }
    };

    void loadTask();
  }, [selectedTaskId, sessionUserId, loadingTasks, hasSelectedTask]);

  // Handlers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || isLoggingIn) return;
    if (!emailIsValid) {
      setLoginError('Please enter a valid email address.');
      return;
    }
    if (isLocked && remainingLockSeconds > 0) {
      setLoginError(`Too many attempts. Try again in ${remainingLockSeconds}s.`);
      return;
    }

    setLoginError(null);
    setIsLoggingIn(true);
    const result = await signIn('credentials', { email, password, redirect: false });

    if (!result || result.error) {
      const keyBase = email.toLowerCase().trim();
      const attemptsKey = `ctt_login_attempts_${keyBase}`;
      const lockKey = `ctt_login_lock_${keyBase}`;
      const nextAttempts = Number(window.localStorage.getItem(attemptsKey) || '0') + 1;
      if (nextAttempts >= 3) {
        const until = Date.now() + 60_000;
        window.localStorage.setItem(lockKey, String(until));
        window.localStorage.removeItem(attemptsKey);
        setLockUntil(until);
        setLoginError('Too many failed attempts. Please retry in 60 seconds.');
      } else {
        window.localStorage.setItem(attemptsKey, String(nextAttempts));
        setLoginError('Invalid email or password. Please try again.');
      }
      setIsLoggingIn(false);
      return;
    }

    window.localStorage.removeItem(`ctt_login_attempts_${email.toLowerCase().trim()}`);
    window.localStorage.removeItem(`ctt_login_lock_${email.toLowerCase().trim()}`);

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
      setIsLoggingIn(false);
      return;
    }

    router.push('/');
    setIsLoggingIn(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changingPassword) return;

    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput) {
      setPasswordChangeError('Please fill all password fields.');
      return;
    }
    if (!passwordPolicyValid) {
      setPasswordChangeError('Use 8+ chars with uppercase, lowercase, number, and symbol.');
      return;
    }
    if (isReusingCurrentPassword) {
      setPasswordChangeError('New password must be different from current password.');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordChangeError('New password and confirmation do not match.');
      return;
    }

    setChangingPassword(true);
    setPasswordChangeError(null);
    try {
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPasswordInput,
          newPassword: newPasswordInput,
          confirmPassword: confirmPasswordInput
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setPasswordChangeError(data?.error || 'Failed to change password.');
        return;
      }

      notify('Password updated. Redirecting to your dashboard...', 'success');
      await updateSession();
      router.refresh();
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      if (session?.user?.role === 'ADMIN') {
        setView('DASHBOARD_ADMIN');
      } else {
        setView('DASHBOARD_STAKEHOLDER');
      }
    } finally {
      setChangingPassword(false);
    }
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
    setSelectedStepOrder(null);
    setView('TASK_DETAIL');
    onRouteChange?.('TASK_DETAIL', task.id);
  };

  const handleOpenTaskById = (taskId: string) => {
    const existing = tasks.find((task) => task.id === taskId);
    if (existing) {
      handleTaskSelect(existing);
      return;
    }
    setSelectedTaskId(taskId);
    setSelectedStepOrder(null);
    setView('TASK_DETAIL');
    onRouteChange?.('TASK_DETAIL', taskId);
  };

  const handleOpenTaskFromInbox = (task: Task, options?: { stepOrder?: number | null; commentId?: string | null }) => {
    setSelectedTaskId(task.id);
    setSelectedStepOrder(options?.stepOrder ?? null);
    setView('TASK_DETAIL');
    onRouteChange?.('TASK_DETAIL', task.id);
    setTasks((prev) => {
      const exists = prev.some((t) => t.id === task.id);
      if (exists) {
        return prev.map((t) => (t.id === task.id ? task : t));
      }
      return [task, ...prev];
    });
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
    if (currentUser?.role === Role.ADMIN) {
      setView('ADMIN_TASK_MANAGEMENT');
      onRouteChange?.('ADMIN_TASK_MANAGEMENT');
    }
  };
  
  const handleAddTasks = (newTasks: Task[]) => {
    setTasks((prev) => {
      const map = new Map(prev.map((task) => [task.id, task]));
      for (const task of newTasks) {
        map.set(task.id, task);
      }
      return Array.from(map.values());
    });
  };

  const handleDeleteTasks = (taskIds: string[]) => {
    if (taskIds.length === 0) return;
    setTasks((prev) => prev.filter((task) => !taskIds.includes(task.id)));
  };

  const handleNavigation = (targetView: ViewState) => {
    setView(targetView);
    if (targetView !== 'TASK_DETAIL') {
      setSelectedTaskId(null);
      setSelectedStepOrder(null);
    }
    onRouteChange?.(targetView, targetView === 'TASK_DETAIL' ? selectedTaskId : null);
  };

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;

  if (status === 'loading' || (session?.user && !currentUser)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="bg-white border border-slate-200 shadow-sm rounded-2xl px-6 py-5 flex items-center gap-3">
          <Loader2 size={18} className="animate-spin text-slate-500" />
          <p className="text-sm text-slate-600 font-medium">Loading your workspace…</p>
        </div>
      </div>
    );
  }

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

             <form className="space-y-6" onSubmit={handleLoginSubmit} aria-describedby="login-help">
                <div>
                   <label htmlFor="login-email" className="block text-sm font-medium text-slate-700">Email address</label>
                   <input 
                     id="login-email"
                     type="email"
                     inputMode="email"
                     autoComplete="username"
                     className={`${fieldBaseClass} mt-1 placeholder-slate-400`} 
                     placeholder="user@dksh.com"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     aria-invalid={Boolean(email) && !emailIsValid}
                     aria-describedby="login-help"
                   />
                </div>
                <div>
                   <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">Password</label>
                   <div className="relative mt-1">
                     <input 
                       id="login-password"
                       type={showPassword ? 'text' : 'password'} 
                       autoComplete="current-password"
                       className={`${fieldBaseClass} pr-12 placeholder-slate-400`} 
                       placeholder="••••••••"
                       value={password}
                       onChange={(e) => setPassword(e.target.value)}
                     />
                     <div className="absolute right-4 top-1/2 -translate-y-1/2">
                       <button
                         type="button"
                         onClick={() => setShowPassword((prev) => !prev)}
                         className="text-slate-400 hover:text-slate-600"
                         aria-label={showPassword ? 'Hide password' : 'Show password'}
                         aria-pressed={showPassword}
                       >
                         {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                       </button>
                     </div>
                   </div>
                </div>

                <label htmlFor="remember-email" className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    id="remember-email"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Remember email on this device
                </label>

                {loginError && (
                  <div role="alert" aria-live="assertive" className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                    {loginError}
                  </div>
                )}
                <p id="login-help" className="sr-only">
                  Enter your DKSH email and password to sign in.
                </p>
                
                <div>
                    <button 
                     type="submit"
                     disabled={isLoggingIn || isLocked || !emailIsValid || !password}
                     className={`w-full flex justify-center items-center gap-2 py-3 px-4 border rounded-xl shadow-sm text-sm font-semibold transition-all ${
                       isLoggingIn || isLocked || !emailIsValid || !password
                         ? 'bg-slate-300 text-slate-500 border-slate-300 cursor-not-allowed'
                         : 'text-white bg-slate-900 border-transparent hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900'
                     }`}
                     aria-busy={isLoggingIn}
                    >
                     {isLoggingIn ? (
                       <>
                         <Loader2 size={16} className="animate-spin" />
                         Signing in...
                       </>
                     ) : (
                       'Sign in'
                     )}
                   </button>
                </div>
             </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
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
          onDeleteTasks={handleDeleteTasks}
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
           currentUserId={currentUser.id}
        />
      )}

      {view === 'TASK_DETAIL' && selectedTaskId && selectedTask && (
        <TaskDetail 
          task={selectedTask} 
          currentUser={currentUser} 
          initialStepOrder={selectedStepOrder}
          onBack={() => handleNavigation(currentUser.role === Role.ADMIN ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER')}
          onUpdateTask={handleTaskUpdate}
          onDeleteTask={handleTaskDelete}
        />
      )}

      {view === 'IMPORT_WIZARD' && (
        <ImportWizard
          tasks={tasks}
          availableCountries={availableCountries}
          availableModules={availableModules}
          onTasksImported={handleAddTasks}
          onOpenTask={handleOpenTaskById}
        />
      )}

      {view === 'INBOX' && (
        <InboxView
          onOpenTask={handleOpenTaskFromInbox}
          currentUserId={currentUser.id}
          isAdmin={currentUser.role === Role.ADMIN}
          onBack={() => handleNavigation(currentUser.role === Role.ADMIN ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER')}
        />
      )}
    </Layout>

    {mustChangePassword && (
      <div className="fixed inset-0 z-[9999] bg-slate-900/65 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="password-change-title" aria-describedby="password-change-desc">
        <div className="w-[min(92vw,560px)] rounded-2xl border border-slate-200 bg-white shadow-2xl p-6">
          <div className="mb-4">
            <h2 id="password-change-title" className="text-3xl font-semibold text-slate-900">Create new password</h2>
            <p id="password-change-desc" className="mt-2 text-base text-slate-500">
              Enter your new password.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleChangePassword}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Current password</label>
              <div className="relative">
                <input
                  type={showCurrentPasswordModal ? 'text' : 'password'}
                  value={currentPasswordInput}
                  onChange={(e) => setCurrentPasswordInput(e.target.value)}
                  className={`${fieldBaseClass} pr-12`}
                  autoComplete="current-password"
                  placeholder="Current password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPasswordModal((prev) => !prev)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showCurrentPasswordModal ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrentPasswordModal ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showNewPasswordModal ? 'text' : 'password'}
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    className={`${fieldBaseClass} pr-12 ${
                      newPasswordInput.length > 0 && (!passwordPolicyValid || isReusingCurrentPassword)
                        ? 'border-rose-400 focus:border-rose-500'
                        : ''
                    }`}
                    autoComplete="new-password"
                    placeholder="New password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPasswordModal((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showNewPasswordModal ? 'Hide new password' : 'Show new password'}
                  >
                    {showNewPasswordModal ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {isReusingCurrentPassword && (
                  <p className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    Don&apos;t reuse your current password.
                  </p>
                )}
                <p className="mt-5 text-base font-medium text-slate-600">Your new password should contain:</p>
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {[
                    { label: '8+ characters', ok: passwordChecks.minLength },
                    { label: 'Uppercase letter', ok: passwordChecks.uppercase },
                    { label: 'Lowercase letter', ok: passwordChecks.lowercase },
                    { label: 'Number', ok: passwordChecks.number },
                    { label: 'Special character', ok: passwordChecks.symbol }
                  ].map(({ label, ok }) => (
                    <div key={label} className={`flex items-center gap-3 text-sm font-medium ${ok ? 'text-emerald-600' : 'text-slate-500'}`}>
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${ok ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {ok ? <Check size={14} /> : <X size={14} />}
                      </span>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
                <div className="relative">
                  <input
                    type={showConfirmPasswordModal ? 'text' : 'password'}
                    value={confirmPasswordInput}
                    onChange={(e) => setConfirmPasswordInput(e.target.value)}
                    className={`${fieldBaseClass} pr-12`}
                    autoComplete="new-password"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPasswordModal((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showConfirmPasswordModal ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPasswordModal ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPasswordInput.length > 0 && (
                  <p className={`mt-2 text-sm ${confirmMatches ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {confirmMatches ? 'Passwords match.' : 'Passwords do not match.'}
                  </p>
                )}
              </div>
            </div>
            {passwordChangeError && (
              <div className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                {passwordChangeError}
              </div>
            )}
            <button
              type="submit"
              disabled={changingPassword || !currentPasswordInput || !passwordPolicyValid || !confirmMatches || isReusingCurrentPassword}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                changingPassword || !currentPasswordInput || !passwordPolicyValid || !confirmMatches || isReusingCurrentPassword
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              }`}
            >
              {changingPassword ? 'Updating...' : 'Set Password'}
            </button>
          </form>
        </div>
      </div>
    )}
    </>
  );
};

export default App;
