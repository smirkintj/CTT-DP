'use client';

import React, { useEffect, useState } from 'react';
import { Bot, Check, Eye, EyeOff, Save } from 'lucide-react';
import { fieldBaseClass, primaryButtonClass, selectBaseClass } from '@/components/ui/formClasses';
import { notify } from '@/lib/notify';

type AiProvider = 'none' | 'anthropic' | 'deepseek';

type AiSettings = {
  provider: AiProvider;
  apiKey: string;
  apiKeySet: boolean;
  model: string;
};

const DEFAULT_MODELS: Record<AiProvider, string> = {
  none: '',
  anthropic: 'claude-haiku-4-5-20251001',
  deepseek: 'deepseek-chat'
};

export const AdminSettings: React.FC = () => {
  const [aiSettings, setAiSettings] = useState<AiSettings>({
    provider: 'none',
    apiKey: '',
    apiKeySet: false,
    model: ''
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/ai-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setAiSettings(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (provider: AiProvider) => {
    setAiSettings((prev) => ({
      ...prev,
      provider,
      model: prev.model || DEFAULT_MODELS[provider]
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/ai-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: aiSettings.provider,
          apiKey: aiSettings.apiKey,
          model: aiSettings.model
        })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        notify(data?.error || 'Failed to save AI settings', 'error');
        return;
      }
      setAiSettings({ ...data, apiKey: '' });
      notify('AI provider settings saved.', 'success');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-slate-500 text-sm">Loading settings…</div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Configure platform-wide settings for CTT.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex items-center gap-2 text-slate-800">
          <Bot size={18} />
          <h2 className="font-semibold text-base">AI Provider</h2>
        </div>

        <p className="text-sm text-slate-500 -mt-2">
          Used for AI-assisted import analysis in the Import wizard. Switch providers at any time
          without redeploying.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
              Provider
            </label>
            <select
              value={aiSettings.provider}
              onChange={(e) => handleProviderChange(e.target.value as AiProvider)}
              className={selectBaseClass}
            >
              <option value="none">None (AI disabled)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>

          {aiSettings.provider !== 'none' && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={aiSettings.apiKey}
                    onChange={(e) => setAiSettings((prev) => ({ ...prev, apiKey: e.target.value }))}
                    className={`${fieldBaseClass} pr-10`}
                    placeholder={
                      aiSettings.apiKeySet ? 'Key saved — paste new key to replace' : 'Paste API key'
                    }
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {aiSettings.apiKeySet && !aiSettings.apiKey && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                    <Check size={12} /> API key is set
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={aiSettings.model}
                  onChange={(e) => setAiSettings((prev) => ({ ...prev, model: e.target.value }))}
                  className={fieldBaseClass}
                  placeholder={DEFAULT_MODELS[aiSettings.provider]}
                />
                <p className="text-xs text-slate-400 mt-1">
                  {aiSettings.provider === 'anthropic'
                    ? 'e.g. claude-haiku-4-5-20251001, claude-sonnet-5'
                    : 'e.g. deepseek-chat, deepseek-reasoner'}
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={handleSave} disabled={saving} className={primaryButtonClass}>
            <span className="inline-flex items-center gap-2">
              <Save size={14} />
              {saving ? 'Saving…' : 'Save Settings'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
