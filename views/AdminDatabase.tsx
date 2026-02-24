'use client';
import React, { useEffect, useState } from 'react';
import { CountryConfig } from '../types';
import { Trash2, Plus, Globe, Package, Bell } from 'lucide-react';

interface AdminDatabaseProps {
  countries: CountryConfig[];
  modules: string[];
  onUpdateCountries: (countries: CountryConfig[]) => void;
  onUpdateModules: (modules: string[]) => void;
}

export const AdminDatabase: React.FC<AdminDatabaseProps> = ({ countries, modules, onUpdateCountries, onUpdateModules }) => {
  const [activeTab, setActiveTab] = useState<'countries' | 'modules' | 'notifications'>('countries');
  const [emailSettings, setEmailSettings] = useState({
    enableReminders: false,
    cronExpression: '0 9 * * 1-5',
    timezone: 'Asia/Singapore',
    note: ''
  });
  
  // Country Input State
  const [newCountryName, setNewCountryName] = useState('');
  const [newCountryCode, setNewCountryCode] = useState('');

  // Module Input State
  const [newModule, setNewModule] = useState('');
  const [teamsConfigs, setTeamsConfigs] = useState<Record<string, {
    teamsWebhookUrl: string;
    isActive: boolean;
    notifyTaskAssigned: boolean;
    notifyReminder: boolean;
    notifySignedOff: boolean;
    notifyFailedStep: boolean;
  }>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('ctt-email-settings');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setEmailSettings((prev) => ({ ...prev, ...parsed }));
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
    })();
  }, []);

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
          alert(data?.error || 'Failed to add country');
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
          alert(data?.error || 'Failed to delete country');
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
          alert(data?.error || 'Failed to add module');
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
          alert(data?.error || 'Failed to delete module');
          return;
        }
        onUpdateModules(modules.filter((module) => module !== mod));
      })();
  };

  const handleSaveEmailSettings = () => {
    window.localStorage.setItem('ctt-email-settings', JSON.stringify(emailSettings));
    alert('Email reminder settings saved.');
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
      const response = await fetch('/api/admin/teams-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          countryCode,
          ...config
        })
      });
      if (!response.ok) {
        alert('Failed to save Teams webhook config');
        return;
      }
      alert(`Teams webhook saved for ${countryCode}`);
    })();
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">System Database</h1>
            <p className="text-slate-500">Manage Master Data and List of Values.</p>
        </div>

        <div className="flex gap-4 mb-6 border-b border-slate-200">
            <button 
              onClick={() => setActiveTab('countries')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'countries' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Countries
            </button>
            <button 
              onClick={() => setActiveTab('modules')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'modules' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Modules
            </button>
            <button 
              onClick={() => setActiveTab('notifications')}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'notifications' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
               Email Notifications
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
                      className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800"
                    >
                      Save Settings
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
                              className="bg-slate-900 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-slate-800"
                            >
                              Save Teams Config
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
            </div>
        )}

    </div>
  );
};
