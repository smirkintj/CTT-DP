'use client';

import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface KnowledgeBaseViewProps {
  onBack: () => void;
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

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({ onBack }) => {
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Status Workflow</h2>
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="flex items-start">
              {workflow.map((item, index) => (
                <React.Fragment key={item.key}>
                  <div className="w-[170px]">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-slate-900 text-white text-xs font-semibold flex items-center justify-center">
                        {index + 1}
                      </div>
                      <p className="text-sm font-semibold text-slate-800">{item.key}</p>
                    </div>
                    <p className="text-xs text-slate-600 mt-2 leading-5">{item.summary}</p>
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
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Exception Route</h2>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800 font-semibold">Blocked / Failed Handling</p>
          <p className="text-xs text-amber-700 mt-1">
            Task can move from <strong>Ready</strong> or <strong>In Progress</strong> to <strong>Blocked</strong> or{' '}
            <strong>Failed</strong>. After fix, continue from <strong>In Progress</strong>.
          </p>
        </div>
      </div>
    </div>
  );
};
