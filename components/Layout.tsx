'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { Role } from '../types';
import { LogOut, LayoutGrid, Bell, MessageSquare, AlertCircle, Check, Info, List, Database, BookOpen, Sparkles, Settings } from 'lucide-react';
import { AssistantDock } from './AssistantDock';
import { sessionToUser } from '@/lib/sessionToUser';

type ActivityItem = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  taskId?: string | null;
  isRead: boolean;
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const currentUser = sessionToUser(session);

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session?.user) { setActivities([]); return; }
    let active = true;
    setLoadingActivities(true);
    fetch('/api/activities', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (active && Array.isArray(data)) setActivities(data); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingActivities(false); });
    return () => { active = false; };
  }, [session?.user?.id]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => { setAvatarError(false); }, [currentUser?.avatarUrl]);

  // While session is resolving, show a skeleton header so authenticated pages
  // don't flash bare content before the nav appears.
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="h-16 bg-white border-b border-slate-200 animate-pulse print:hidden" />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      </div>
    );
  }

  // Unauthenticated — render children only (login page)
  if (!currentUser) return <>{children}</>;

  const isAdmin = currentUser.role === Role.ADMIN;
  const displayName = currentUser.name || currentUser.email || 'User';
  const roleLabel = isAdmin ? 'Administrator' : `${currentUser.countryCode} • ${currentUser.role}`;
  const initials = currentUser.name ? currentUser.name.trim().charAt(0).toUpperCase() : '?';
  const unreadCount = activities.filter((a) => !a.isRead).length;

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

  const markAllRead = async () => {
    const r = await fetch('/api/activities/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    if (!r.ok) return;
    setActivities((prev) => prev.map((a) => ({ ...a, isRead: true })));
  };

  const markRead = async (activityId: string) => {
    const r = await fetch('/api/activities/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId }),
    });
    if (!r.ok) return;
    setActivities((prev) => prev.map((a) => (a.id === activityId ? { ...a, isRead: true } : a)));
  };

  const dashboardHref = isAdmin ? '/admin/dashboard' : '/';
  const isDashboard = isAdmin ? pathname === '/admin/dashboard' : pathname === '/';
  const isInbox = pathname === '/inbox';
  const isKnowledgeBase = pathname === '/knowledge-base';
  const isAdminTasks = pathname.startsWith('/admin/tasks') || pathname === '/import';
  const isJiraQueue = pathname === '/admin/jira-intake';
  const isAdminDb = pathname === '/admin/database';
  const isAdminSettings = pathname === '/admin/settings';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-8">
              <div
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => router.push(dashboardHref)}
              >
                <div className="h-8 w-auto px-2 bg-brand-500 rounded flex items-center justify-center shadow-sm group-hover:bg-brand-600 transition-colors">
                  <span className="text-white font-bold text-sm tracking-wider">CTT</span>
                </div>
                <div className="hidden md:block">
                  <span className="font-bold text-lg tracking-tight text-slate-900 block leading-tight">CTT</span>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider block leading-none">Cuba Try Test</span>
                </div>
              </div>

              <nav className="hidden md:flex gap-1 ml-4 items-center">
                <NavItem active={isDashboard} icon={<LayoutGrid size={16} />} label="Dashboard" onClick={() => router.push(dashboardHref)} />
                {!isAdmin && (
                  <NavItem active={isInbox} icon={<MessageSquare size={16} />} label="Inbox" onClick={() => router.push('/inbox')} />
                )}
                <NavItem active={isKnowledgeBase} icon={<BookOpen size={16} />} label="Knowledge Base" onClick={() => router.push('/knowledge-base')} />
                {isAdmin && (
                  <>
                    <NavItem active={isAdminTasks} icon={<List size={16} />} label="Tasks" onClick={() => router.push('/admin/tasks')} />
                    <NavItem active={isJiraQueue} icon={<Sparkles size={16} />} label="JIRA Queue" onClick={() => router.push('/admin/jira-intake')} />
                    <NavItem active={isAdminDb} icon={<Database size={16} />} label="Config" onClick={() => router.push('/admin/database')} />
                    <NavItem active={isAdminSettings} icon={<Settings size={16} />} label="Settings" onClick={() => router.push('/admin/settings')} />
                  </>
                )}
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`p-2 rounded-full transition-colors relative ${showNotifications ? 'bg-brand-50 text-brand-600' : 'text-slate-400 hover:text-brand-500 hover:bg-brand-50'}`}
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-brand-500 rounded-full border-2 border-white" />
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-100 ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2 origin-top-right overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                      <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                      <button onClick={markAllRead} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Mark all read</button>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {loadingActivities ? (
                        <div className="p-8 text-center text-slate-400"><p className="text-sm">Loading notifications...</p></div>
                      ) : activities.length === 0 ? (
                        <div className="p-8 text-center text-slate-400"><p className="text-sm">No notifications</p></div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {activities.map((n) => (
                            <button
                              key={n.id}
                              onClick={() => {
                                if (!n.isRead) void markRead(n.id);
                                if (n.taskId && n.type === 'COMMENT_ADDED') {
                                  setShowNotifications(false);
                                  router.push(`/tasks/${n.taskId}`);
                                }
                              }}
                              className={`w-full text-left p-4 hover:bg-slate-50 transition-colors flex gap-3 ${!n.isRead ? 'bg-brand-50/10' : ''}`}
                            >
                              <div className={`mt-1 flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                                n.type === 'STATUS_CHANGED' ? 'bg-rose-100 text-rose-600' :
                                n.type === 'SIGNED_OFF' || n.type === 'DEPLOYED' ? 'bg-emerald-100 text-emerald-600' :
                                n.type === 'COMMENT_ADDED' ? 'bg-blue-100 text-blue-600' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {n.type === 'STATUS_CHANGED' && <AlertCircle size={14} />}
                                {(n.type === 'SIGNED_OFF' || n.type === 'DEPLOYED') && <Check size={14} />}
                                {n.type === 'COMMENT_ADDED' && <MessageSquare size={14} />}
                                {n.type === 'TASK_ASSIGNED' && <Info size={14} />}
                              </div>
                              <div>
                                <p className="text-sm text-slate-800 leading-snug">{n.message}</p>
                                <p className="text-xs text-slate-400 mt-1">{formatTimeAgo(n.createdAt)}</p>
                              </div>
                              {!n.isRead && <div className="mt-2 w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-2 border-t border-slate-100 text-center">
                      <button
                        onClick={() => { setShowNotifications(false); router.push('/inbox'); }}
                        className="text-xs text-slate-500 hover:text-slate-800 font-medium py-1"
                      >
                        View All History
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-6 w-px bg-slate-200 mx-1" />

              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-slate-900">{displayName}</p>
                  <p className="text-xs text-slate-500">{roleLabel}</p>
                </div>
                {currentUser.avatarUrl && !avatarError ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={currentUser.avatarUrl}
                    alt="User"
                    onError={() => setAvatarError(true)}
                    className="w-9 h-9 rounded-full border border-slate-200 shadow-sm object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full border border-slate-200 shadow-sm bg-slate-100 text-slate-600 flex items-center justify-center text-sm font-semibold">
                    {initials}
                  </div>
                )}
                <button
                  onClick={() => void signOut({ callbackUrl: '/' })}
                  className="text-slate-400 hover:text-slate-800 ml-2"
                  aria-label="Sign out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="print:hidden border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-400 select-none">© {new Date().getFullYear()} DKSH CSSC Digital Product</span>
          <span className="text-[11px] font-mono text-slate-400 select-none">v{process.env.NEXT_PUBLIC_APP_VERSION ?? '1.0.0'}</span>
        </div>
      </footer>

      <AssistantDock currentUser={currentUser} />
    </div>
  );
};

const NavItem: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  badge?: number;
}> = ({ active, icon, label, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`relative flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
      active ? 'bg-slate-100 text-brand-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
    }`}
  >
    {icon}
    {label}
    {badge != null && badge > 0 && (
      <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
        {badge}
      </span>
    )}
  </button>
);
