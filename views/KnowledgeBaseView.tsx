'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, AtSign, CheckCircle2, MessageSquarePlus, XCircle } from 'lucide-react';
import { Role } from '../types';

interface KnowledgeBaseViewProps {
  onBack: () => void;
  onNavigate: (target: 'DASHBOARD_STAKEHOLDER' | 'DASHBOARD_ADMIN' | 'INBOX' | 'ADMIN_TASK_MANAGEMENT' | 'IMPORT_WIZARD' | 'ADMIN_DATABASE') => void;
  currentUserName: string;
  currentUserRole: Role;
}

const workflow = [
  {
    key: 'Draft',
    summary: 'Visible to stakeholder, but testing actions are locked until admin marks READY.'
  },
  {
    key: 'Ready',
    summary: 'Admin finalized details and released the task for stakeholder execution.'
  },
  {
    key: 'In Progress',
    summary: 'Stakeholder is executing steps, adding evidence, and posting comments.'
  },
  {
    key: 'Passed',
    summary: 'All required steps are passing and task is signed off.'
  },
  {
    key: 'Deployed',
    summary: 'Admin has released/deployed the final implementation.'
  }
];

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({ onBack, onNavigate, currentUserName, currentUserRole }) => {
  const [adminName, setAdminName] = useState('Admin');
  const [activeTab, setActiveTab] = useState<'WORKFLOW' | 'HOW_TO_TEST' | 'COMMENTS' | 'FAQ'>('WORKFLOW');

  const stakeholderName = useMemo(() => {
    if (currentUserRole === Role.STAKEHOLDER) {
      return currentUserName || 'Stakeholder';
    }
    return 'Stakeholder';
  }, [currentUserName, currentUserRole]);

  useEffect(() => {
    const loadAdminName = async () => {
      const response = await fetch('/api/users/mentions', { cache: 'no-store' });
      if (!response.ok) return;
      const users = await response.json();
      if (!Array.isArray(users)) return;
      const admins = users
        .filter((user) => user?.role === 'ADMIN' && typeof user?.name === 'string')
        .map((user) => user.name.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      if (admins[0]) setAdminName(admins[0]);
    };
    void loadAdminName();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <button
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-2xl font-bold text-slate-900">Knowledge Base</h1>
        <p className="text-slate-500 mt-1">Workflow reference and status definitions.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 flex flex-wrap gap-2">
        {[
          { key: 'WORKFLOW', label: 'Workflow' },
          { key: 'HOW_TO_TEST', label: 'How To Test' },
          { key: 'COMMENTS', label: 'Comments & Tagging' },
          { key: 'FAQ', label: 'FAQ' }
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as 'WORKFLOW' | 'HOW_TO_TEST' | 'COMMENTS' | 'FAQ')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'WORKFLOW' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Status Workflow</h2>
          <div className="overflow-x-auto">
            <div className="min-w-[900px] flex justify-center">
              <div className="flex items-start justify-center">
                {workflow.map((item, index) => (
                  <React.Fragment key={item.key}>
                    <div className="w-[170px] text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className={`h-8 w-8 rounded-full text-white text-xs font-semibold flex items-center justify-center ${
                            index === 0
                              ? 'bg-slate-700'
                              : index === 1
                                ? 'bg-indigo-600'
                                : index === 2
                                  ? 'bg-blue-600'
                                  : index === 3
                                    ? 'bg-emerald-600'
                                    : 'bg-amber-600'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <p className="text-sm font-semibold text-slate-800">{item.key}</p>
                      </div>
                      <p className="text-xs text-slate-600 mt-2 leading-5 px-2">{item.summary}</p>
                    </div>
                    {index < workflow.length - 1 && (
                      <div className="w-14 flex items-center justify-center pt-4">
                        <div className="h-px w-10 bg-slate-300" />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">Exception Route</p>
            <p className="text-xs text-amber-700 mt-1">
              From <span className="font-medium">Ready</span> or <span className="font-medium">In Progress</span>, task can move to
              <span className="font-medium"> Blocked</span> or <span className="font-medium">Failed</span>. After fix, move back to
              <span className="font-medium"> In Progress</span>.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'HOW_TO_TEST' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">How To Test</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Step 1</p>
              <div className="mt-2 flex items-center gap-2 text-slate-900">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <XCircle size={16} className="text-rose-600" />
                <p className="text-sm font-semibold">Pass / Fail Steps</p>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                {stakeholderName} opens a task and marks each step as PASS or FAIL based on test execution result.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Step 2</p>
              <div className="mt-2 flex items-center gap-2 text-slate-900">
                <MessageSquarePlus size={16} className="text-blue-600" />
                <p className="text-sm font-semibold">Add Comments</p>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Use comments to explain outcomes, attach evidence, or request support from {adminName}.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Step 3</p>
              <div className="mt-2 flex items-center gap-2 text-slate-900">
                <AtSign size={16} className="text-violet-600" />
                <p className="text-sm font-semibold">Tag People</p>
              </div>
              <p className="text-xs text-slate-600 mt-2">
                Type <span className="font-mono">@</span> to tag teammates. Mention {adminName} for blockers and decision points.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'COMMENTS' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Comments & Tagging</h2>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">When to use comments</p>
            <ul className="mt-2 text-xs text-slate-600 space-y-1">
              <li>- Explain why a step passed/failed</li>
              <li>- Attach evidence and context for faster review</li>
              <li>- Ask for support when blocked</li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">How tagging works</p>
            <p className="mt-2 text-xs text-slate-600">
              Type <span className="font-mono">@</span> and select a user from suggestions. Use this for targeted follow-up.
              Example: tag <span className="font-semibold">{adminName}</span> for blocker resolution.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'FAQ' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">FAQ</h2>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">Why can’t I edit a signed-off task?</p>
            <p className="text-xs text-slate-600 mt-1">Signed-off tasks are locked for audit integrity.</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">When should I use Blocked vs Failed?</p>
            <p className="text-xs text-slate-600 mt-1">
              Use Blocked when you cannot proceed due to dependency. Use Failed when execution completed and outcome is not expected.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">Why is task still In Progress after steps pass?</p>
            <p className="text-xs text-slate-600 mt-1">Task is treated complete only after sign-off.</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">How do I download the signed-off PDF?</p>
            <p className="text-xs text-slate-600 mt-1">
              Open the signed-off task detail and use the sign-off report download action. PDF export is available only after sign-off.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-sm font-semibold text-slate-800">How do I know portal emails are legitimate?</p>
            <p className="text-xs text-slate-600 mt-1">
              Official notifications come from the configured portal sender address and include your task title, country, and portal context.
              The portal will never ask for your password, OTP, or payment details by email. If anything looks suspicious, do not click links:
              open the portal directly, then verify the same task in Task Detail/Inbox before taking action.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Quick Links</h2>
        <div className="flex flex-wrap gap-2">
          {currentUserRole === Role.ADMIN ? (
            <>
              <button onClick={() => onNavigate('ADMIN_TASK_MANAGEMENT')} className="px-3 py-1.5 text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800">Manage Tasks</button>
              <button onClick={() => onNavigate('IMPORT_WIZARD')} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">Import Steps</button>
              <button onClick={() => onNavigate('ADMIN_DATABASE')} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">User/Config</button>
            </>
          ) : (
            <>
              <button onClick={() => onNavigate('DASHBOARD_STAKEHOLDER')} className="px-3 py-1.5 text-xs rounded-md bg-slate-900 text-white hover:bg-slate-800">Open My Tasks</button>
              <button onClick={() => onNavigate('INBOX')} className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50">Open Inbox</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
