'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, ExternalLink, Layers3, Loader2, Orbit, Plus, Search, Sparkles } from 'lucide-react';
import { JiraIssueGroup, JiraTaskPrefill, User } from '../types';
import { apiFetch, ApiError } from '../lib/http';
import { notify } from '../lib/notify';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface AdminJiraIntakeProps {
  currentUser: User;
  onOpenTask: (taskId: string) => void;
  onCreateTask: (prefill: JiraTaskPrefill) => void;
}

type JiraIntakeResponse = {
  configured: boolean;
  error?: string;
  groups: JiraIssueGroup[];
};

const formatDate = (value?: string) => {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const priorityClassMap: Record<string, string> = {
  highest: 'bg-rose-500/15 text-rose-200 border border-rose-400/20',
  high: 'bg-amber-500/15 text-amber-200 border border-amber-400/20',
  medium: 'bg-sky-500/15 text-sky-200 border border-sky-400/20',
  low: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20',
  lowest: 'bg-slate-500/15 text-slate-200 border border-slate-400/20'
};

const getPriorityClass = (priority?: string | null) => {
  if (!priority) return 'bg-white/5 text-slate-300 border border-white/10';
  return priorityClassMap[priority.toLowerCase()] ?? 'bg-white/5 text-slate-300 border border-white/10';
};

export const AdminJiraIntake: React.FC<AdminJiraIntakeProps> = ({ currentUser, onOpenTask, onCreateTask }) => {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [groups, setGroups] = useState<JiraIssueGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {}
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setPageError(null);
      try {
        const data = await apiFetch<JiraIntakeResponse>('/api/admin/jira-intake');
        setConfigured(data.configured);
        setGroups(Array.isArray(data.groups) ? data.groups : []);
        if (!data.configured && data.error) {
          setPageError(data.error);
        }
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Failed to load Jira intake';
        setPageError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        issues: group.issues.filter((issue) => issue.key.toLowerCase().includes(normalizedQuery))
      }))
      .filter((group) => group.issues.length > 0 || group.error);
  }, [groups, searchTerm]);

  const totalIssueCount = filteredGroups.reduce((sum, group) => sum + group.issues.length, 0);
  const accessibleProductsLabel =
    currentUser.productAccesses && currentUser.productAccesses.length > 0
      ? currentUser.productAccesses.map((product) => product.name).join(' • ')
      : 'All products';

  const createFromIssue = (issue: JiraIssueGroup['issues'][number], forceDuplicate = false) => {
    if (!forceDuplicate && issue.linkedTasks.length > 0) {
      setConfirmDialog({
        open: true,
        title: 'Create Another Task?',
        message: `A CTT task already exists for ${issue.key}. Create another task anyway?`,
        confirmLabel: 'Create Anyway',
        onConfirm: () => createFromIssue(issue, true)
      });
      return;
    }

    onCreateTask({
      jiraTicket: issue.key,
      title: issue.summary,
      description: `Imported from Jira ${issue.key}`,
      productId: issue.productId,
      productName: issue.productName
    });
  };

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-slate-800 bg-[#060b18] p-6 text-white shadow-[0_30px_80px_rgba(2,6,23,0.35)]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-0 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute left-1/3 top-1/3 h-48 w-48 rounded-full bg-rose-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Admin · Jira Intake</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Ready for UAT</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Browse Jira items by product before creating CTT tasks. This view only shows products within your admin scope.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.9)]" />
              Scope: {accessibleProductsLabel}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full min-w-[260px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search by Jira key"
                className="w-full rounded-2xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-200">
              {totalIssueCount} visible item{totalIssueCount === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        {pageError && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 text-amber-300" />
              <div>
                <p className="font-medium">Jira intake is not fully available.</p>
                <p className="mt-1 text-amber-100/80">{pageError}</p>
                <p className="mt-2 text-xs text-amber-100/70">
                  Technical dependency: set <code>JIRA_BASE_URL</code>, <code>JIRA_API_EMAIL</code>, and <code>JIRA_API_TOKEN</code> on the server.
                </p>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-white/10 bg-white/5">
            <div className="flex items-center gap-3 text-slate-300">
              <Loader2 size={18} className="animate-spin" />
              Loading Jira intake...
            </div>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-[24px] border border-white/10 bg-white/5 p-10 text-center text-slate-300">
            <Sparkles size={22} className="mx-auto mb-3 text-indigo-300" />
            <p className="text-lg font-medium text-white">No Jira items found</p>
            <p className="mt-2 text-sm text-slate-400">Either no products are configured yet, or the selected Jira statuses returned no results.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredGroups.map((group, groupIndex) => {
              const [heroIssue, ...otherIssues] = group.issues;
              const orbClass =
                groupIndex % 3 === 0
                  ? 'from-indigo-400 to-indigo-700 shadow-[0_0_28px_rgba(99,102,241,0.5)]'
                  : groupIndex % 3 === 1
                    ? 'from-fuchsia-400 to-violet-700 shadow-[0_0_28px_rgba(168,85,247,0.45)]'
                    : 'from-rose-400 to-pink-700 shadow-[0_0_28px_rgba(244,63,94,0.45)]';

              return (
                <section key={group.productId} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-black tracking-[0.2em] text-white ${orbClass}`}>
                      {group.projectKey || group.productName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-white">{group.productName}</h2>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          {group.projectKey || 'Project key missing'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Pulling statuses: {group.statuses.length > 0 ? group.statuses.join(', ') : 'No statuses configured'}
                      </p>
                    </div>
                    <div className="ml-auto text-xs text-slate-500">{group.issues.length} item{group.issues.length === 1 ? '' : 's'}</div>
                  </div>

                  {group.error ? (
                    <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
                      Failed to load Jira issues for {group.productName}. {group.error}
                    </div>
                  ) : group.issues.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-400">
                      No Jira items returned for this product yet.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-4">
                      {heroIssue && (
                        <article className="relative flex min-h-[248px] flex-[1_1_360px] flex-col overflow-hidden rounded-[24px] border border-indigo-400/30 bg-gradient-to-br from-slate-900/95 via-slate-900/95 to-indigo-950/70 p-5 shadow-[0_24px_60px_rgba(79,70,229,0.24)]">
                          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full border border-indigo-400/10" />
                          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full border border-indigo-400/15" />
                          <div className="pointer-events-none absolute left-0 top-10 h-px w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent" />

                          <div className="relative z-10 flex h-full flex-col">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs font-black tracking-[0.2em] text-indigo-300">{heroIssue.key}</div>
                                <h3 className="mt-2 text-xl font-semibold leading-tight text-white">{heroIssue.summary}</h3>
                              </div>
                              <Orbit size={18} className="text-indigo-300/80" />
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
                                {heroIssue.status}
                              </span>
                              {heroIssue.priority && (
                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getPriorityClass(heroIssue.priority)}`}>
                                  {heroIssue.priority}
                                </span>
                              )}
                              {heroIssue.linkedTasks.length > 0 && (
                                <span className="rounded-full border border-amber-300/20 bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100">
                                  Already linked
                                </span>
                              )}
                            </div>

                            <div className="mt-5 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Updated</div>
                                <div className="mt-1">{formatDate(heroIssue.updatedAt)}</div>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Assignee</div>
                                <div className="mt-1">{heroIssue.assigneeName || 'Unassigned'}</div>
                              </div>
                            </div>

                            {heroIssue.linkedTasks.length > 0 && (
                              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Linked CTT Tasks</div>
                                <div className="mt-2 space-y-2">
                                  {heroIssue.linkedTasks.map((task) => (
                                    <button
                                      key={task.id}
                                      type="button"
                                      onClick={() => onOpenTask(task.id)}
                                      className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-left text-sm text-slate-200 transition hover:border-indigo-300/40 hover:bg-slate-900/70"
                                    >
                                      <span className="truncate">{task.title}</span>
                                      <span className="ml-3 shrink-0 text-xs text-slate-400">{task.countryCode}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="mt-auto flex flex-wrap gap-2 pt-5">
                              {heroIssue.linkedTasks.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => onOpenTask(heroIssue.linkedTasks[0].id)}
                                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-indigo-300/40 hover:bg-white/10"
                                >
                                  Open Linked Task <ExternalLink size={14} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => createFromIssue(heroIssue)}
                                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                              >
                                Create Task <Plus size={14} />
                              </button>
                            </div>
                          </div>
                        </article>
                      )}

                      {otherIssues.map((issue) => (
                        <article
                          key={issue.key}
                          className="relative flex min-h-[220px] flex-[1_1_210px] flex-col overflow-hidden rounded-[20px] border border-white/10 bg-slate-950/70 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.35)] transition hover:-translate-y-1 hover:border-indigo-300/30"
                        >
                          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.12),transparent_56%)]" />
                          <div className="relative z-10 flex h-full flex-col">
                            <div className="text-[11px] font-black tracking-[0.18em] text-indigo-300">{issue.key}</div>
                            <h4 className="mt-2 text-sm font-semibold leading-6 text-slate-100">{issue.summary}</h4>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <span className="rounded-full border border-emerald-400/15 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100">
                                {issue.status}
                              </span>
                              {issue.linkedTasks.length > 0 ? (
                                <span className="rounded-full border border-amber-300/15 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-100">
                                  Linked
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-4 space-y-1 text-xs text-slate-400">
                              <p>Updated: {formatDate(issue.updatedAt)}</p>
                              <p>Assignee: {issue.assigneeName || 'Unassigned'}</p>
                              <p>Priority: {issue.priority || 'N/A'}</p>
                            </div>

                            <div className="mt-auto flex flex-wrap gap-2 pt-5">
                              {issue.linkedTasks.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => onOpenTask(issue.linkedTasks[0].id)}
                                  className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                                >
                                  Open <ArrowRight size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => createFromIssue(issue)}
                                className="inline-flex items-center gap-1 rounded-full bg-indigo-400/90 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-indigo-300"
                              >
                                Create <Plus size={12} />
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
};
