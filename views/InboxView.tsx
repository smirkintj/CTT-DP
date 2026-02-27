'use client';

import React, { useEffect, useState } from 'react';
import { Task } from '../types';
import { MessageSquare, ArrowRight, ArrowLeft } from 'lucide-react';

interface InboxItem {
  taskId: string;
  taskTitle: string;
  countryCode: string;
  status: string;
  assigneeId: string | null;
  unreadCount: number;
  latestMessage: string;
  latestAt: string;
  latestStepOrder: number | null;
  latestCommentId: string;
}

interface InboxViewProps {
  onOpenTask: (task: Task, options?: { stepOrder?: number | null; commentId?: string | null }) => void;
  onBack: () => void;
  currentUserId: string;
  isAdmin: boolean;
}

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

export const InboxView: React.FC<InboxViewProps> = ({ onOpenTask, onBack, currentUserId, isAdmin }) => {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'MINE' | 'NEEDS_ATTENTION'>('ALL');
  const filters: Array<{ key: 'ALL' | 'MINE' | 'NEEDS_ATTENTION'; label: string }> = [
    { key: 'ALL', label: 'All Discussions' },
    ...(isAdmin ? [{ key: 'MINE' as const, label: 'My Assigned Tasks' }] : []),
    { key: 'NEEDS_ATTENTION', label: 'Blocked / Failed' }
  ];

  const loadInbox = async () => {
    setLoading(true);
    const response = await fetch('/api/inbox', { cache: 'no-store' });
    if (!response.ok) {
      setLoading(false);
      return;
    }
    const data = await response.json();
    setItems(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    void loadInbox();
  }, []);

  const markTaskRead = async (taskId: string) => {
    const response = await fetch('/api/inbox/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId })
    });
    if (!response.ok) return;
    setItems((prev) => prev.map((item) => (item.taskId === taskId ? { ...item, unreadCount: 0 } : item)));
  };

  const markAllRead = async () => {
    const response = await fetch('/api/inbox/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true })
    });
    if (!response.ok) return;
    setItems((prev) => prev.map((item) => ({ ...item, unreadCount: 0 })));
  };

  const openTask = async (item: InboxItem) => {
    const taskId = item.taskId;
    const response = await fetch(`/api/tasks/${taskId}`, { cache: 'no-store' });
    if (!response.ok) return;
    const task = await response.json();
    await markTaskRead(taskId);
    onOpenTask(task as Task, {
      stepOrder: item.latestStepOrder,
      commentId: item.latestCommentId
    });
  };

  const filteredItems = items.filter((item) => {
    if (activeFilter === 'MINE') {
      return item.assigneeId === currentUserId;
    }
    if (activeFilter === 'NEEDS_ATTENTION') {
      const key = item.status.toString().trim().replace(/\s+/g, '_').toUpperCase();
      return key === 'FAILED' || key === 'BLOCKED';
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-end">
        <div>
          <button
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-2xl font-bold text-slate-900">Discussion Inbox</h1>
          <p className="text-slate-500">Unread comments grouped by task.</p>
        </div>
        <button
          onClick={markAllRead}
          className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Mark all read
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-2 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setActiveFilter(filter.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeFilter === filter.key
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 animate-card-enter">
        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading inbox...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-slate-500">No unread discussions.</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void loadInbox()}
                className="px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={onBack}
                className="px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        ) : (
          filteredItems.map((item) => (
            <button
              key={item.taskId}
              onClick={() => void openTask(item)}
              className="w-full text-left p-4 hover:bg-slate-50 transition-all motion-safe:hover:-translate-y-0.5 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-blue-500" />
                  <span className="text-sm font-semibold text-slate-900 truncate">{item.taskTitle}</span>
                  {item.unreadCount > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {item.unreadCount} unread
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 mt-1 truncate">{item.latestMessage}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {item.countryCode} · {formatTimeAgo(item.latestAt)}
                </p>
              </div>
              <ArrowRight size={16} className="text-slate-300" />
            </button>
          ))
        )}
      </div>
    </div>
  );
};
