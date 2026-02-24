import React from 'react';
import { Status, Priority } from '../types';

interface BadgeProps {
  type: 'status' | 'priority' | 'country' | 'module';
  value: string;
  className?: string;
}

const normalizeStatusKey = (status: string) => {
  if (!status) return 'UNKNOWN';
  return status.toString().trim().replace(/\s+/g, '_').toUpperCase();
};

const getStatusLabel = (status: string) => {
  const key = normalizeStatusKey(status);
  const labelMap: Record<string, string> = {
    READY: 'Ready',
    IN_PROGRESS: 'In Progress',
    PASSED: 'Passed',
    FAILED: 'Failed',
    DEPLOYED: 'Deployed',
    BLOCKED: 'Blocked',
    PENDING: 'Pending',
    DRAFT: 'Draft'
  };
  return labelMap[key] ?? status;
};

const getStatusColor = (status: string) => {
  switch (normalizeStatusKey(status)) {
    case 'READY':
    case 'PENDING':
      return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'IN_PROGRESS':
      return 'bg-blue-50 text-blue-700 border-blue-100';
    case 'PASSED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'FAILED':
      return 'bg-rose-50 text-rose-700 border-rose-100';
    case 'BLOCKED':
      return 'bg-amber-50 text-amber-700 border-amber-100';
    case 'DEPLOYED':
      return 'bg-indigo-50 text-indigo-700 border-indigo-100';
    default:
      return 'bg-gray-100 text-gray-600';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case Priority.LOW: return 'text-slate-600 font-medium';
    case Priority.MEDIUM: return 'text-blue-600 font-medium';
    case Priority.HIGH: return 'text-amber-600 font-medium';
    case Priority.CRITICAL: return 'text-rose-600 font-medium';
    default: return 'text-slate-600 font-medium';
  }
};

const getPriorityDotColor = (priority: string) => {
  switch (priority?.toString().trim().replace(/\s+/g, '_').toUpperCase()) {
    case 'LOW': return 'bg-slate-400';
    case 'MEDIUM': return 'bg-blue-500';
    case 'HIGH': return 'bg-amber-500';
    case 'CRITICAL': return 'bg-rose-500';
    default: return 'bg-slate-400';
  }
};

const getPriorityLabel = (priority: string) => {
  const key = priority?.toString().trim().replace(/\s+/g, '_').toUpperCase();
  const labelMap: Record<string, string> = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical'
  };
  return labelMap[key] ?? priority;
};

export const Badge: React.FC<BadgeProps> = ({ type, value, className = '' }) => {
  if (type === 'status') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(value)} ${className}`}>
        {getStatusLabel(value)}
      </span>
    );
  }

  if (type === 'priority') {
    return (
      <span className={`text-xs flex items-center gap-1 ${getPriorityColor(value)} ${className}`}>
         <span className={`w-1.5 h-1.5 rounded-full ${getPriorityDotColor(value)}`} />
         {getPriorityLabel(value)}
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
