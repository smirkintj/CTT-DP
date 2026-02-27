'use client';

import React from 'react';

export const KnowledgeBaseCard: React.FC = () => {
  const mainFlow = [
    {
      key: 'Draft',
      value: 'Visible to stakeholder, but testing actions are locked until admin marks READY.'
    },
    {
      key: 'Ready',
      value: 'Admin finalized details and released task for execution.'
    },
    {
      key: 'In Progress',
      value: 'Stakeholder is running steps, adding evidence, and updating results.'
    },
    {
      key: 'Passed',
      value: 'All steps are passing and task is signed off.'
    },
    {
      key: 'Deployed',
      value: 'Task has been released/deployed by admin.'
    }
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 animate-card-enter">
      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-2">Knowledge Base</h3>
      <p className="text-xs text-slate-500 mb-4">End-to-end status flow and exception path.</p>

      <div className="rounded-lg border border-slate-200 p-4">
        <div className="relative">
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200" />
          <div className="space-y-4">
            {mainFlow.map((item, index) => (
              <div key={item.key} className="relative flex items-start gap-3">
                <div
                  className={`z-10 mt-0.5 h-5 w-5 rounded-full border flex items-center justify-center text-[10px] font-semibold ${
                    index < 2
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : index === 2
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-emerald-600 border-emerald-600 text-white'
                  }`}
                >
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{item.key}</p>
                  <p className="text-xs text-slate-600">{item.value}</p>
                </div>
              </div>
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
  );
};
