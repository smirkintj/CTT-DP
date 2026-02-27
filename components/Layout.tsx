'use client';
import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { User, Role } from '../types';
import { LogOut, LayoutGrid, UploadCloud, Bell, MessageSquare, AlertCircle, Check, Info, List, Database, BookOpen } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentUser: User;
  onLogout: () => void;
  onNavigate: (view: any) => void;
  currentView: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, currentUser, onLogout, onNavigate, currentView }) => {
  const router = useRouter();
  const isAdmin = currentUser.role === Role.ADMIN;
  const [showNotifications, setShowNotifications] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [activities, setActivities] = useState<Array<{ id: string; type: string; message: string; createdAt: string; taskId?: string | null; isRead: boolean }>>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const notifRef = useRef<HTMLDivElement>(null);
  const displayName = isAdmin ? 'Admin User' : (currentUser.name || 'User');
  const roleLabel = isAdmin ? 'Administrator' : `${currentUser.countryCode} • ${currentUser.role}`;
  const initials = currentUser.name ? currentUser.name.trim().charAt(0).toUpperCase() : '?';

  const unreadCount = activities.filter((item) => !item.isRead).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setAvatarError(false);
  }, [currentUser.avatarUrl]);

  useEffect(() => {
    const loadActivities = async () => {
      setLoadingActivities(true);
      const response = await fetch('/api/activities', { cache: 'no-store' });
      if (!response.ok) {
        setLoadingActivities(false);
        return;
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        setActivities(data);
      }
      setLoadingActivities(false);
    };
    void loadActivities();
  }, [currentUser.id]);

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
    const response = await fetch('/api/activities/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true })
    });
    if (!response.ok) return;
    setActivities((prev) => prev.map((item) => ({ ...item, isRead: true })));
  };

  const markRead = async (activityId: string) => {
    const response = await fetch('/api/activities/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activityId })
    });
    if (!response.ok) return;
    setActivities((prev) =>
      prev.map((item) => (item.id === activityId ? { ...item, isRead: true } : item))
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            
            {/* Logo & Brand */}
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2 cursor-pointer group" onClick={() => onNavigate(isAdmin ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER')}>
                {/* DKSH Style Brand Mark */}
                <div className="h-8 w-auto px-2 bg-brand-500 rounded flex items-center justify-center shadow-sm group-hover:bg-brand-600 transition-colors">
                  <span className="text-white font-bold text-sm tracking-wider">CTT</span>
                </div>
                <div className="hidden md:block">
                  <span className="font-bold text-lg tracking-tight text-slate-900 block leading-tight">CTT</span>
                  <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider block leading-none">Cuba Try Test</span>
                </div>
              </div>

              {/* Main Nav */}
              <nav className="hidden md:flex gap-1 ml-4 items-center">
                <NavItem
                  active={currentView === (isAdmin ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER')}
                  icon={<LayoutGrid size={16} />}
                  label="Dashboard"
                  onClick={() => onNavigate(isAdmin ? 'DASHBOARD_ADMIN' : 'DASHBOARD_STAKEHOLDER')}
                />
                {!isAdmin && (
                  <NavItem
                    active={currentView === 'INBOX'}
                    icon={<MessageSquare size={16} />}
                    label="Inbox"
                    onClick={() => onNavigate('INBOX')}
                  />
                )}
                <NavItem
                  active={currentView === 'KNOWLEDGE_BASE'}
                  icon={<BookOpen size={16} />}
                  label="Knowledge Base"
                  onClick={() => onNavigate('KNOWLEDGE_BASE')}
                />
                {isAdmin ? (
                  <>
                    <NavItem 
                      active={currentView === 'ADMIN_TASK_MANAGEMENT'} 
                      icon={<List size={16} />} 
                      label="Manage Tasks" 
                      onClick={() => onNavigate('ADMIN_TASK_MANAGEMENT')} 
                    />
                    <NavItem 
                      active={currentView === 'IMPORT_WIZARD'} 
                      icon={<UploadCloud size={16} />} 
                      label="Import" 
                      onClick={() => onNavigate('IMPORT_WIZARD')} 
                    />
                    <NavItem 
                      active={currentView === 'ADMIN_DATABASE'} 
                      icon={<Database size={16} />} 
                      label="Database" 
                      onClick={() => onNavigate('ADMIN_DATABASE')} 
                    />
                  </>
                ) : null}
              </nav>
            </div>

            {/* Right Side: User Profile & Notifications */}
            <div className="flex items-center gap-4">
               
               {/* Notification Bell */}
               <div className="relative" ref={notifRef}>
                 <button 
                   onClick={() => setShowNotifications(!showNotifications)}
                   className={`p-2 rounded-full transition-colors relative ${showNotifications ? 'bg-brand-50 text-brand-600' : 'text-slate-400 hover:text-brand-500 hover:bg-brand-50'}`}
                 >
                   <Bell size={20} />
                   {unreadCount > 0 && (
                     <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-brand-500 rounded-full border-2 border-white"></span>
                   )}
                 </button>

                 {/* Dropdown */}
                 {showNotifications && (
                   <div className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-100 ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2 origin-top-right overflow-hidden">
                     <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                       <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                       <button onClick={markAllRead} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Mark all read</button>
                     </div>
                     <div className="max-h-[400px] overflow-y-auto">
                       {loadingActivities ? (
                         <div className="p-8 text-center text-slate-400">
                           <p className="text-sm">Loading notifications...</p>
                         </div>
                       ) : activities.length === 0 ? (
                         <div className="p-8 text-center text-slate-400">
                           <p className="text-sm">No notifications</p>
                         </div>
                       ) : (
                         <div className="divide-y divide-slate-50">
                          {activities.map(n => (
                             <button
                               key={n.id}
                               onClick={() => {
                                 if (!n.isRead) {
                                   void markRead(n.id);
                                 }
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
                               {!n.isRead && (
                                 <div className="mt-2 w-2 h-2 rounded-full bg-brand-500 flex-shrink-0"></div>
                               )}
                             </button>
                           ))}
                         </div>
                       )}
                     </div>
                     <div className="p-2 border-t border-slate-100 text-center">
                       <button
                         onClick={() => {
                           setShowNotifications(false);
                           onNavigate('INBOX');
                         }}
                         className="text-xs text-slate-500 hover:text-slate-800 font-medium py-1"
                       >
                         View All History
                       </button>
                     </div>
                   </div>
                 )}
               </div>
               
               <div className="h-6 w-px bg-slate-200 mx-1"></div>

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
                 <button onClick={onLogout} className="text-slate-400 hover:text-slate-800 ml-2">
                   <LogOut size={18} />
                 </button>
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

const NavItem: React.FC<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
      active 
        ? 'bg-slate-100 text-brand-600' 
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
    }`}
  >
    {icon}
    {label}
  </button>
);
