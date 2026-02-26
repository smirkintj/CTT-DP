'use client';
import React, { useEffect, useState } from 'react';
import { CountryConfig } from '../types';
import { Trash2, Plus, Package, Bell, Users, Search, X, RotateCcw, UserPlus } from 'lucide-react';
import { notify } from '../lib/notify';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, subtleButtonClass } from '../components/ui/formClasses';

interface AdminDatabaseProps {
  countries: CountryConfig[];
  modules: string[];
  onUpdateCountries: (countries: CountryConfig[]) => void;
  onUpdateModules: (modules: string[]) => void;
  currentUserId: string;
}

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAKEHOLDER';
  countryCode: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedTaskCount: number;
};

type UserDrawerMode = 'create' | 'edit';

export const AdminDatabase: React.FC<AdminDatabaseProps> = ({
  countries,
  modules,
  onUpdateCountries,
  onUpdateModules,
  currentUserId
}) => {
  const [activeTab, setActiveTab] = useState<'countries' | 'modules' | 'notifications' | 'users'>('countries');
  const [emailSettings, setEmailSettings] = useState({
    enableReminders: false,
    cronExpression: '0 9 * * 1-5',
    timezone: 'Asia/Singapore',
    note: ''
  });
  const [savedEmailSettings, setSavedEmailSettings] = useState({
    enableReminders: false,
    cronExpression: '0 9 * * 1-5',
    timezone: 'Asia/Singapore',
    note: ''
  });
  const [emailSaveState, setEmailSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // Country Input State
  const [newCountryName, setNewCountryName] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('');

  // Module Input State
  const [newModule, setNewModule] = useState('');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userCountryFilter, setUserCountryFilter] = useState<'ALL' | string>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [userDrawerMode, setUserDrawerMode] = useState<UserDrawerMode>('create');
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    countryCode: '',
    isActive: true
  });
  const [tempPassword, setTempPassword] = useState('');
  const [teamsConfigs, setTeamsConfigs] = useState<Record<string, {
    teamsWebhookUrl: string;
    isActive: boolean;
    notifyTaskAssigned: boolean;
    notifyReminder: boolean;
    notifySignedOff: boolean;
    notifyFailedStep: boolean;
  }>>({});
  const [savedTeamsConfigs, setSavedTeamsConfigs] = useState<Record<string, {
    teamsWebhookUrl: string;
    isActive: boolean;
    notifyTaskAssigned: boolean;
    notifyReminder: boolean;
    notifySignedOff: boolean;
    notifyFailedStep: boolean;
  }>>({});
  const [teamsSaveStateByCountry, setTeamsSaveStateByCountry] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('ctt-email-settings');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setEmailSettings((prev) => ({ ...prev, ...parsed }));
      setSavedEmailSettings((prev) => ({ ...prev, ...parsed }));
    } catch {}
  }, []);

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/admin/teams-webhooks', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (!Array.isArray(data)) return;
      const next: Record<string, any> = {};
      for (const item of data) {
        if (!item?.countryCode) continue;
        next[item.countryCode] = {
          teamsWebhookUrl: item.teamsWebhookUrl || '',
          isActive: Boolean(item.isActive),
          notifyTaskAssigned: item.notifyTaskAssigned !== false,
          notifyReminder: item.notifyReminder !== false,
          notifySignedOff: item.notifySignedOff !== false,
          notifyFailedStep: item.notifyFailedStep !== false
        };
      }
      setTeamsConfigs(next);
      setSavedTeamsConfigs(next);
    })();
  }, []);

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        notify(data?.error || 'Failed to load users', 'error');
        return;
      }
      if (Array.isArray(data)) {
        setUsers(data as AdminUserRow[]);
      }
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'users') return;
    void loadUsers();
  }, [activeTab]);

  const openCreateUserDrawer = () => {
    setUserDrawerMode('create');
    setSelectedUser(null);
    setUserForm({
      name: '',
      email: '',
      countryCode: countries[0]?.code || '',
      isActive: true
    });
    setTempPassword('');
    setIsUserDrawerOpen(true);
  };

  const openEditUserDrawer = (user: AdminUserRow) => {
    setUserDrawerMode('edit');
    setSelectedUser(user);
    setUserForm({
      name: user.name,
      email: user.email,
      countryCode: user.countryCode || '',
      isActive: user.isActive
    });
    setTempPassword('');
    setIsUserDrawerOpen(true);
  };

  const closeUserDrawer = () => {
    if (savingUser || resettingPassword) return;
    setIsUserDrawerOpen(false);
  };

  const saveUser = async () => {
    const name = userForm.name.trim();
    const email = userForm.email.trim().toLowerCase();
    const countryCode = userForm.countryCode.trim().toUpperCase();
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!name) {
      notify('Name is required', 'error');
      return;
    }
    if (userDrawerMode === 'create' && !isEmailValid) {
      notify('Enter a valid email address', 'error');
      return;
    }
    if (!countryCode) {
      notify('Country is required', 'error');
      return;
    }

    setSavingUser(true);
    try {
      if (userDrawerMode === 'create') {
        const password = tempPassword.trim();
        if (password.length < 8) {
          notify('Temporary password must be at least 8 characters', 'error');
          return;
        }

        const response = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            role: 'STAKEHOLDER',
            countryCode,
            temporaryPassword: password
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to create user', 'error');
          return;
        }
        notify('User created successfully', 'success');
      } else if (selectedUser) {
        const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            countryCode,
            isActive: userForm.isActive,
            role: selectedUser.role
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to update user', 'error');
          return;
        }
        notify('User updated successfully', 'success');
      }

      await loadUsers();
      setIsUserDrawerOpen(false);
    } finally {
      setSavingUser(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    const confirmed = window.confirm(`Reset password for ${selectedUser.email}?`);
    if (!confirmed) return;

    setResettingPassword(true);
    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST'
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        notify(data?.error || 'Failed to reset password', 'error');
        return;
      }
      notify(
        data?.emailSent
          ? 'Password reset email sent successfully'
          : 'Password reset completed but email was not sent',
        data?.emailSent ? 'success' : 'error'
      );
    } finally {
      setResettingPassword(false);
    }
  };

  const emailSettingsDirty =
    emailSettings.enableReminders !== savedEmailSettings.enableReminders ||
    emailSettings.cronExpression !== savedEmailSettings.cronExpression ||
    emailSettings.timezone !== savedEmailSettings.timezone ||
    emailSettings.note !== savedEmailSettings.note;

  const hasUnsavedTeamsConfig = Object.keys(teamsConfigs).some((countryCode) => {
    const current = teamsConfigs[countryCode];
    const saved = savedTeamsConfigs[countryCode] || {
      teamsWebhookUrl: '',
      isActive: false,
      notifyTaskAssigned: true,
      notifyReminder: true,
      notifySignedOff: true,
      notifyFailedStep: true
    };
    return JSON.stringify(current) !== JSON.stringify(saved);
  });

  const filteredUsers = users.filter((user) => {
    const query = userSearch.trim().toLowerCase();
    const matchesSearch =
      !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
    const matchesCountry = userCountryFilter === 'ALL' || user.countryCode === userCountryFilter;
    const matchesStatus =
      userStatusFilter === 'ALL' ||
      (userStatusFilter === 'ACTIVE' ? user.isActive : !user.isActive);
    return matchesSearch && matchesCountry && matchesStatus;
  });

  const formatDateTime = (value?: string | null) =>
    value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  const handleAddCountry = () => {
      if (!newCountryName || !newCountryCode) return;
      void (async () => {
        const response = await fetch('/api/admin/countries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newCountryName, code: newCountryCode })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to add country', 'error');
          return;
        }

        const next = [...countries.filter((country) => country.code !== data.code), data].sort((a, b) =>
          a.code.localeCompare(b.code)
        );
        onUpdateCountries(next);
        setNewCountryName('');
        setNewCountryCode('');
      })();
  };

  const handleDeleteCountry = (code: string) => {
      void (async () => {
        const response = await fetch('/api/admin/countries', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to delete country', 'error');
          return;
        }
        onUpdateCountries(countries.filter((country) => country.code !== code));
      })();
  };

  const handleAddModule = () => {
      if (!newModule || modules.includes(newModule)) return;
      void (async () => {
        const response = await fetch('/api/admin/modules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newModule })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to add module', 'error');
          return;
        }
        onUpdateModules([...modules, data.name].sort((a, b) => a.localeCompare(b)));
        setNewModule('');
      })();
  };

  const handleDeleteModule = (mod: string) => {
      void (async () => {
        const response = await fetch('/api/admin/modules', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: mod })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to delete module', 'error');
          return;
        }
        onUpdateModules(modules.filter((module) => module !== mod));
      })();
  };

  const handleSaveEmailSettings = () => {
    setEmailSaveState('saving');
    window.localStorage.setItem('ctt-email-settings', JSON.stringify(emailSettings));
    setSavedEmailSettings(emailSettings);
    setEmailSaveState('saved');
    notify('Email reminder settings saved.', 'success');
    window.setTimeout(() => setEmailSaveState('idle'), 1500);
  };

  const saveTeamsConfig = (countryCode: string) => {
    const config = teamsConfigs[countryCode] || {
      teamsWebhookUrl: '',
      isActive: false,
      notifyTaskAssigned: true,
      notifyReminder: true,
      notifySignedOff: true,
      notifyFailedStep: true
    };

    void (async () => {
      setTeamsSaveStateByCountry((prev) => ({ ...prev, [countryCode]: 'saving' }));
      const response = await fetch('/api/admin/teams-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode,
          ...config
        })
      });
      if (!response.ok) {
        setTeamsSaveStateByCountry((prev) => ({ ...prev, [countryCode]: 'error' }));
        notify(`Failed to save Teams webhook for ${countryCode}`, 'error');
        return;
      }
      setSavedTeamsConfigs((prev) => ({ ...prev, [countryCode]: config }));
      setTeamsSaveStateByCountry((prev) => ({ ...prev, [countryCode]: 'saved' }));
      notify(`Teams webhook saved for ${countryCode}`, 'success');
      window.setTimeout(() => {
        setTeamsSaveStateByCountry((prev) => ({ ...prev, [countryCode]: 'idle' }));
      }, 1500);
    })();
  };

  const handleTabChange = (nextTab: 'countries' | 'modules' | 'notifications' | 'users') => {
    if (activeTab === 'notifications' && nextTab !== 'notifications' && (emailSettingsDirty || hasUnsavedTeamsConfig)) {
      const confirmed = window.confirm('You have unsaved notification settings. Leave without saving?');
      if (!confirmed) return;
    }
    setActiveTab(nextTab);
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (activeTab === 'notifications' && (emailSettingsDirty || hasUnsavedTeamsConfig)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [activeTab, emailSettingsDirty, hasUnsavedTeamsConfig]);

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">System Database</h1>
            <p className="text-slate-500">Manage Master Data and List of Values.</p>
        </div>

        <div className="flex gap-4 mb-6 border-b border-slate-200">
            <button 
              onClick={() => handleTabChange('countries')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'countries' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Countries
            </button>
            <button 
              onClick={() => handleTabChange('modules')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'modules' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Modules
            </button>
            <button 
              onClick={() => handleTabChange('notifications')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'notifications' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Email Notifications
            </button>
            <button 
              onClick={() => handleTabChange('users')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'users' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Users
            </button>
        </div>

        {activeTab === 'countries' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex gap-3 mb-6 items-end bg-slate-50 p-4 rounded-lg">
                    <div className="flex-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Country Name</label>
                        <input 
                           type="text" 
                           className="w-full mt-1 border-slate-300 rounded-md text-sm" 
                           placeholder="e.g. Indonesia"
                           value={newCountryName}
                           onChange={(e) => setNewCountryName(e.target.value)}
                        />
                    </div>
                    <div className="w-32">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Code</label>
                        <input 
                           type="text" 
                           className="w-full mt-1 border-slate-300 rounded-md text-sm uppercase" 
                           placeholder="ID"
                           maxLength={2}
                           value={newCountryCode}
                           onChange={(e) => setNewCountryCode(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={handleAddCountry}
                        className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2 h-[38px]"
                    >
                        <Plus size={16} /> Add
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {countries.map(c => (
                        <div key={c.code} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-xs">
                                    {c.code}
                                </div>
                                <span className="text-sm font-medium text-slate-900">{c.name}</span>
                            </div>
                            <button onClick={() => handleDeleteCountry(c.code)} className="text-slate-400 hover:text-red-500 p-1">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {activeTab === 'modules' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <div className="flex gap-3 mb-6 items-end bg-slate-50 p-4 rounded-lg">
                    <div className="flex-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase">Module Name</label>
                        <input 
                           type="text" 
                           className="w-full mt-1 border-slate-300 rounded-md text-sm" 
                           placeholder="e.g. Logistics"
                           value={newModule}
                           onChange={(e) => setNewModule(e.target.value)}
                        />
                    </div>
                    <button 
                        onClick={handleAddModule}
                        className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 flex items-center gap-2 h-[38px]"
                    >
                        <Plus size={16} /> Add
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {modules.map(m => (
                        <div key={m} className="flex justify-between items-center p-3 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-3">
                                <Package size={18} className="text-slate-400" />
                                <span className="text-sm font-medium text-slate-900">{m}</span>
                            </div>
                            <button onClick={() => handleDeleteModule(m)} className="text-slate-400 hover:text-red-500 p-1">
                                <Trash2 size={16} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {activeTab === 'notifications' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="flex items-start gap-3">
                    <Bell className="text-slate-500 mt-0.5" size={18} />
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">Reminder Job Configuration</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Configure cron settings in the admin portal. This is settings-only for now; scheduler wiring can be added later.
                        </p>
                    </div>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={emailSettings.enableReminders}
                      onChange={(e) => setEmailSettings((prev) => ({ ...prev, enableReminders: e.target.checked }))}
                    />
                    Enable reminder job
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase">Cron Expression</label>
                        <input
                          type="text"
                          className="w-full mt-1 border-slate-300 rounded-md text-sm"
                          value={emailSettings.cronExpression}
                          onChange={(e) => setEmailSettings((prev) => ({ ...prev, cronExpression: e.target.value }))}
                          placeholder="0 9 * * 1-5"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 uppercase">Timezone</label>
                        <input
                          type="text"
                          className="w-full mt-1 border-slate-300 rounded-md text-sm"
                          value={emailSettings.timezone}
                          onChange={(e) => setEmailSettings((prev) => ({ ...prev, timezone: e.target.value }))}
                          placeholder="Asia/Singapore"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase">Notes</label>
                    <textarea
                      className="w-full mt-1 border-slate-300 rounded-md text-sm h-20"
                      value={emailSettings.note}
                      onChange={(e) => setEmailSettings((prev) => ({ ...prev, note: e.target.value }))}
                      placeholder="Optional admin notes for scheduler setup."
                    />
                </div>

                <div className="flex justify-end">
                    <button
                      onClick={handleSaveEmailSettings}
                      disabled={!emailSettingsDirty || emailSaveState === 'saving'}
                      className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800"
                    >
                      {emailSaveState === 'saving'
                        ? 'Saving...'
                        : emailSaveState === 'saved'
                          ? 'Saved'
                          : 'Save Settings'}
                    </button>
                </div>

                <div className="border-t border-slate-200 pt-5 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-900">Microsoft Teams Webhooks (per country)</h3>
                  <p className="text-xs text-slate-500">
                    Configure incoming webhook URLs per market channel. Supported events: assignment, reminder, sign-off, failed step.
                  </p>

                  <div className="space-y-4">
                    {countries.map((country) => {
                      const config = teamsConfigs[country.code] || {
                        teamsWebhookUrl: '',
                        isActive: false,
                        notifyTaskAssigned: true,
                        notifyReminder: true,
                        notifySignedOff: true,
                        notifyFailedStep: true
                      };

                      return (
                        <div key={country.code} className="rounded-lg border border-slate-200 p-4 bg-slate-50">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-slate-800">{country.code} - {country.name}</p>
                            <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={config.isActive}
                                onChange={(e) =>
                                  setTeamsConfigs((prev) => ({
                                    ...prev,
                                    [country.code]: { ...config, isActive: e.target.checked }
                                  }))
                                }
                              />
                              Active
                            </label>
                          </div>

                          <input
                            type="text"
                            placeholder="https://outlook.office.com/webhook/..."
                            className="w-full border-slate-300 rounded-md text-sm mb-3"
                            value={config.teamsWebhookUrl}
                            onChange={(e) =>
                              setTeamsConfigs((prev) => ({
                                ...prev,
                                [country.code]: { ...config, teamsWebhookUrl: e.target.value }
                              }))
                            }
                          />

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-3">
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={config.notifyTaskAssigned}
                                onChange={(e) =>
                                  setTeamsConfigs((prev) => ({
                                    ...prev,
                                    [country.code]: { ...config, notifyTaskAssigned: e.target.checked }
                                  }))
                                }
                              />
                              Task assigned
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={config.notifyReminder}
                                onChange={(e) =>
                                  setTeamsConfigs((prev) => ({
                                    ...prev,
                                    [country.code]: { ...config, notifyReminder: e.target.checked }
                                  }))
                                }
                              />
                              Reminder
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={config.notifySignedOff}
                                onChange={(e) =>
                                  setTeamsConfigs((prev) => ({
                                    ...prev,
                                    [country.code]: { ...config, notifySignedOff: e.target.checked }
                                  }))
                                }
                              />
                              Signed off
                            </label>
                            <label className="inline-flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={config.notifyFailedStep}
                                onChange={(e) =>
                                  setTeamsConfigs((prev) => ({
                                    ...prev,
                                    [country.code]: { ...config, notifyFailedStep: e.target.checked }
                                  }))
                                }
                              />
                              Failed step
                            </label>
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => saveTeamsConfig(country.code)}
                              disabled={teamsSaveStateByCountry[country.code] === 'saving'}
                              className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-800"
                            >
                              {teamsSaveStateByCountry[country.code] === 'saving'
                                ? 'Saving...'
                                : teamsSaveStateByCountry[country.code] === 'saved'
                                  ? 'Saved'
                                  : 'Save Teams Config'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
            </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
              <div className="flex items-center gap-2 text-slate-700">
                <Users size={18} />
                <h3 className="text-sm font-semibold">User Management</h3>
              </div>
              <button onClick={openCreateUserDrawer} className={primaryButtonClass}>
                <span className="inline-flex items-center gap-2">
                  <UserPlus size={16} />
                  Add User
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <div className="md:col-span-2 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search by name or email"
                  className={`${fieldBaseClass} pl-9`}
                />
              </div>
              <select
                value={userCountryFilter}
                onChange={(event) => setUserCountryFilter(event.target.value)}
                className={selectBaseClass}
              >
                <option value="ALL">All countries</option>
                {countries.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.code} - {country.name}
                  </option>
                ))}
              </select>
              <select
                value={userStatusFilter}
                onChange={(event) => setUserStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'DISABLED')}
                className={selectBaseClass}
              >
                <option value="ALL">All status</option>
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm table-fixed">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-3 w-[22%]">Name</th>
                    <th className="px-3 py-3 w-[30%]">Email</th>
                    <th className="px-3 py-3 w-[10%]">Country</th>
                    <th className="px-3 py-3 w-[12%]">Status</th>
                    <th className="px-3 py-3 w-[18%]">Last Login</th>
                    <th className="px-3 py-3 w-[8%] text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        Loading users...
                      </td>
                    </tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td className="px-3 py-3 font-medium text-slate-900 truncate">{user.name}</td>
                        <td className="px-3 py-3 truncate">{user.email}</td>
                        <td className="px-3 py-3">{user.countryCode || '—'}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {user.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-3 py-3">{formatDateTime(user.lastLoginAt)}</td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => openEditUserDrawer(user)}
                            className="text-sm font-medium text-slate-700 hover:text-slate-900"
                          >
                            Manage
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isUserDrawerOpen && (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-[1px]">
            <div className="h-full w-full max-w-md bg-white shadow-xl border-l border-slate-200 p-6 overflow-y-auto">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {userDrawerMode === 'create' ? 'Create User' : 'Manage User'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {userDrawerMode === 'create'
                      ? 'Create a stakeholder account with temporary password.'
                      : 'Update profile, status, and reset password.'}
                  </p>
                </div>
                <button onClick={closeUserDrawer} className="text-slate-500 hover:text-slate-700">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Name</label>
                  <input
                    type="text"
                    value={userForm.name}
                    onChange={(event) => setUserForm((prev) => ({ ...prev, name: event.target.value }))}
                    className={`${fieldBaseClass} mt-1`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Email</label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                    disabled={userDrawerMode === 'edit'}
                    className={`${fieldBaseClass} mt-1 ${userDrawerMode === 'edit' ? 'opacity-70 cursor-not-allowed' : ''}`}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Country</label>
                  <select
                    value={userForm.countryCode}
                    onChange={(event) => setUserForm((prev) => ({ ...prev, countryCode: event.target.value }))}
                    className={`${selectBaseClass} mt-1`}
                  >
                    <option value="">Select country</option>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.code} - {country.name}
                      </option>
                    ))}
                  </select>
                </div>

                {userDrawerMode === 'create' ? (
                  <div>
                    <label className="text-xs font-semibold uppercase text-slate-500">Temporary Password</label>
                    <input
                      type="text"
                      value={tempPassword}
                      onChange={(event) => setTempPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                      className={`${fieldBaseClass} mt-1`}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={userForm.isActive}
                          onChange={(event) => setUserForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                          disabled={selectedUser?.id === currentUserId}
                        />
                        Active account
                      </label>
                      {selectedUser?.id === currentUserId && (
                        <p className="text-xs text-slate-500 mt-1">Your own admin account cannot be disabled.</p>
                      )}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500 mb-2">Last login</p>
                      <p className="text-sm text-slate-800">{formatDateTime(selectedUser?.lastLoginAt)}</p>
                    </div>
                  </>
                )}
              </div>

              {userDrawerMode === 'edit' && (
                <div className="mt-6">
                  <button
                    onClick={handleResetPassword}
                    disabled={resettingPassword}
                    className={subtleButtonClass}
                  >
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw size={14} />
                      {resettingPassword ? 'Resetting...' : 'Reset Password'}
                    </span>
                  </button>
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                <button onClick={closeUserDrawer} className={subtleButtonClass}>
                  Cancel
                </button>
                <button onClick={saveUser} disabled={savingUser} className={primaryButtonClass}>
                  {savingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

    </div>
  );
};
