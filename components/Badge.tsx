import React from 'react';
import { Status, Priority } from '../types';

interface BadgeProps {
  type: 'status' | 'priority' | 'country' | 'module';
  value: string;
  className?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case Status.PENDING: return 'bg-slate-100 text-slate-600 border-slate-200';
    case Status.IN_PROGRESS: return 'bg-blue-50 text-blue-700 border-blue-100';
    case Status.PASSED: return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case Status.FAILED: return 'bg-rose-50 text-rose-700 border-rose-100';
    case Status.BLOCKED: return 'bg-amber-50 text-amber-700 border-amber-100';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case Priority.LOW: return 'text-slate-500';
    case Priority.MEDIUM: return 'text-blue-600';
    case Priority.HIGH: return 'text-amber-600 font-medium';
    case Priority.CRITICAL: return 'text-rose-600 font-bold';
    default: return 'text-slate-500';
  }
};

export const Badge: React.FC<BadgeProps> = ({ type, value, className = '' }) => {
  if (type === 'status') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(value)} ${className}`}>
        {value}
      </span>
    );
  }

  if (type === 'priority') {
    return (
      <span className={`text-xs flex items-center gap-1 ${getPriorityColor(value)} ${className}`}>
         {value === Priority.CRITICAL && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"/>}
         {value === Priority.HIGH && <span className="w-1.5 h-1.5 rounded-full bg-amber-500"/>}
         {value}
      </span>
    );
  }

  if (type === 'module') {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 ${className}`}>
        {value}
      </span>
    );
  }

  // Country tag generic fallback (custom colors handled by parent usually, but default here)
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 ${className}`}>
      {value}
    </span>
  );
};
