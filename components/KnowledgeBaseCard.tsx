'use client';

import React from 'react';

export const KnowledgeBaseCard: React.FC = () => {
  const statusDefinitions = [
    {
      key: 'Draft',
      value: 'Visible to stakeholder, but testing actions are locked until admin marks it READY.'
    },
    {
      key: 'Ready',
      value: 'Task is prepared by admin and ready for stakeholder execution.'
    },
    {
      key: 'In Progress',
      value: 'At least one test step is being executed or updated by stakeholder.'
    },
    {
      key: 'Blocked',
      value: 'Testing cannot proceed due to dependency or issue requiring intervention.'
    },
    {
      key: 'Failed',
      value: 'One or more steps failed and require correction/retest.'
    },
    {
      key: 'Passed',
      value: 'All required steps are passing, pending final sign-off if not yet signed.'
    },
    {
      key: 'Deployed',
      value: 'Task has been released/deployed by admin.'
    }
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 animate-card-enter">
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-2">Knowledge Base</h3>
      <p className="text-xs text-slate-500 mb-4">Status workflow and what each status means.</p>

      <details className="group rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 flex items-center justify-between">
          Workflow
          <span className="text-slate-400 group-open:rotate-180 transition-transform">⌄</span>
        </summary>
        <p className="text-xs text-slate-600 mt-3">
          Draft → Ready → In Progress → Passed → Deployed
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Exception path: In Progress/Ready → Blocked or Failed, then return to In Progress after fix.
        </p>
      </details>

      <details className="group rounded-lg border border-slate-200 p-3 mt-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-800 flex items-center justify-between">
          Status Definitions
          <span className="text-slate-400 group-open:rotate-180 transition-transform">⌄</span>
        </summary>
        <div className="mt-3 space-y-2">
          {statusDefinitions.map((item) => (
            <div key={item.key} className="text-xs">
              <p className="font-semibold text-slate-700">{item.key}</p>
              <p className="text-slate-600">{item.value}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};
