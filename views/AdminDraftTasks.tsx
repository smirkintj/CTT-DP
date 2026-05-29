'use client';
import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ChevronDown, ChevronRight, Check, X, Loader2, ExternalLink, Sparkles, FileText, Clock } from 'lucide-react';
import { apiFetch } from '@/lib/http';
import { notify } from '@/lib/notify';
import { fieldBaseClass, primaryButtonClass, selectBaseClass, textareaBaseClass } from '@/components/ui/formClasses';

type DraftTaskStep = { description: string; expectedResult: string };

type GeneratedData = {
  title: string;
  description: string;
  module: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  steps: DraftTaskStep[];
};

type DraftTask = {
  id: string;
  jiraTicket: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  generatedData: GeneratedData;
  editedData: GeneratedData | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedBy: { name: string } | null;
  resultTaskIds: string[];
  createdAt: string;
  product: { id: string; name: string; slug: string };
};

type Country = { code: string; name: string };
type Stakeholder = { id: string; name: string; email: string; countryCode: string };

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;

export const AdminDraftTasks: React.FC = () => {
  const { data: session } = useSession();
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Record<string, EditState>>({});
  const [countries, setCountries] = useState<Country[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [showRejectInput, setShowRejectInput] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([
      apiFetch<DraftTask[]>('/api/admin/draft-tasks'),
      apiFetch<Country[]>('/api/admin/countries'),
      apiFetch<Stakeholder[]>('/api/admin/stakeholders'),
    ]).then(([d, c, s]) => {
      if (Array.isArray(d)) setDrafts(d);
      if (Array.isArray(c)) setCountries(c);
      if (Array.isArray(s)) setStakeholders(s);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [session?.user?.id]);

  const expand = (draft: DraftTask) => {
    if (expandedId === draft.id) { setExpandedId(null); return; }
    setExpandedId(draft.id);
    if (!editState[draft.id]) {
      const data = draft.editedData ?? draft.generatedData;
      setEditState((prev) => ({
        ...prev,
        [draft.id]: { ...data, countries: [], assigneeByCountry: {}, dueDate: '' }
      }));
    }
  };

  const updateEdit = (id: string, patch: Partial<typeof editState[string]>) => {
    setEditState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const updateStep = (id: string, idx: number, field: keyof DraftTaskStep, value: string) => {
    setEditState((prev) => {
      const steps = [...(prev[id]?.steps ?? [])];
      steps[idx] = { ...steps[idx], [field]: value };
      return { ...prev, [id]: { ...prev[id], steps } };
    });
  };

  const approve = async (draft: DraftTask) => {
    const state = editState[draft.id];
    if (!state?.countries?.length) { notify('Select at least one country', 'error'); return; }
    setSubmitting(draft.id);
    try {
      await apiFetch(`/api/admin/draft-tasks/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve', taskData: state }),
      });
      setDrafts((prev) => prev.map((d) => d.id === draft.id ? { ...d, status: 'APPROVED' } : d));
      setExpandedId(null);
      notify('UAT task created successfully', 'success');
    } catch {
      notify('Failed to approve draft', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const reject = async (draft: DraftTask) => {
    setSubmitting(draft.id);
    try {
      await apiFetch(`/api/admin/draft-tasks/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject', reason: rejectReason[draft.id] ?? '' }),
      });
      setDrafts((prev) => prev.map((d) => d.id === draft.id ? { ...d, status: 'REJECTED' } : d));
      setShowRejectInput(null);
      setExpandedId(null);
      notify('Draft rejected', 'success');
    } catch {
      notify('Failed to reject draft', 'error');
    } finally {
      setSubmitting(null);
    }
  };

  const pending = drafts.filter((d) => d.status === 'PENDING');
  const reviewed = drafts.filter((d) => d.status !== 'PENDING');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-violet-100 flex items-center justify-center">
          <Sparkles size={16} className="text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">AI Draft Tasks</h1>
          <p className="text-sm text-slate-500">UAT task drafts generated from SIT results — review and approve to create</p>
        </div>
      </div>

      {/* Pending */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Pending Review ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <FileText size={32} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 text-sm">No pending drafts. CTT will generate new ones automatically when QA marks SIT complete in Jira.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                expanded={expandedId === draft.id}
                onToggle={() => expand(draft)}
                editState={editState[draft.id]}
                onEditUpdate={(patch) => updateEdit(draft.id, patch)}
                onStepUpdate={(idx, field, val) => updateStep(draft.id, idx, field, val)}
                countries={countries}
                stakeholders={stakeholders}
                onApprove={() => approve(draft)}
                onReject={() => reject(draft)}
                showRejectInput={showRejectInput === draft.id}
                onToggleRejectInput={() => setShowRejectInput(showRejectInput === draft.id ? null : draft.id)}
                rejectReason={rejectReason[draft.id] ?? ''}
                onRejectReasonChange={(v) => setRejectReason((prev) => ({ ...prev, [draft.id]: v }))}
                submitting={submitting === draft.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Reviewed */}
      {reviewed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Reviewed ({reviewed.length})
          </h2>
          <div className="space-y-2">
            {reviewed.map((draft) => (
              <div key={draft.id} className="bg-white border border-slate-200 rounded-xl px-5 py-3 flex items-center gap-4">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${draft.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                  {draft.status}
                </span>
                <span className="font-mono text-xs text-slate-500">{draft.jiraTicket}</span>
                <span className="text-sm text-slate-700 flex-1 truncate">{(draft.editedData ?? draft.generatedData).title}</span>
                <span className="text-xs text-slate-400">{draft.product.name}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

type EditState = GeneratedData & {
  countries: string[];
  assigneeByCountry: Record<string, string>;
  dueDate: string;
};

type DraftCardProps = {
  draft: DraftTask;
  expanded: boolean;
  onToggle: () => void;
  editState: EditState;
  onEditUpdate: (patch: object) => void;
  onStepUpdate: (idx: number, field: keyof DraftTaskStep, val: string) => void;
  countries: Country[];
  stakeholders: Stakeholder[];
  onApprove: () => void;
  onReject: () => void;
  showRejectInput: boolean;
  onToggleRejectInput: () => void;
  rejectReason: string;
  onRejectReasonChange: (v: string) => void;
  submitting: boolean;
};

const DraftCard: React.FC<DraftCardProps> = ({
  draft, expanded, onToggle, editState, onEditUpdate, onStepUpdate,
  countries, stakeholders, onApprove, onReject,
  showRejectInput, onToggleRejectInput, rejectReason, onRejectReasonChange, submitting
}) => {
  const jiraBase = process.env.NEXT_PUBLIC_JIRA_BASE_URL || 'https://dksh.atlassian.net';

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        {expanded ? <ChevronDown size={16} className="text-slate-400 shrink-0" /> : <ChevronRight size={16} className="text-slate-400 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <a
              href={`${jiraBase}/browse/${draft.jiraTicket}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-xs text-brand-600 hover:underline flex items-center gap-1"
            >
              {draft.jiraTicket} <ExternalLink size={10} />
            </a>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-400">{draft.product.name}</span>
          </div>
          <p className="text-sm font-medium text-slate-800 truncate">{draft.generatedData.title}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${draft.generatedData.priority === 'HIGH' ? 'bg-rose-100 text-rose-700' : draft.generatedData.priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
            {draft.generatedData.priority}
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock size={10} /> {new Date(draft.createdAt).toLocaleDateString()}
          </span>
        </div>
      </button>

      {/* Expanded editor */}
      {expanded && editState && (
        <div className="border-t border-slate-100 px-5 py-5 space-y-5 bg-slate-50/50">

          {/* AI badge */}
          <div className="flex items-center gap-2 text-xs text-violet-600 font-medium">
            <Sparkles size={12} />
            Generated by DeepSeek V4 Pro — review and edit before approving
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Task Title</label>
            <input
              type="text"
              className={`${fieldBaseClass} text-sm`}
              value={editState.title}
              onChange={(e) => onEditUpdate({ title: e.target.value })}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea
              className={`${textareaBaseClass} text-sm`}
              rows={3}
              value={editState.description}
              onChange={(e) => onEditUpdate({ description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Module */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Module</label>
              <input
                type="text"
                className={`${fieldBaseClass} text-sm`}
                value={editState.module}
                onChange={(e) => onEditUpdate({ module: e.target.value })}
              />
            </div>
            {/* Priority */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
              <select
                className={`${selectBaseClass} text-sm`}
                value={editState.priority}
                onChange={(e) => onEditUpdate({ priority: e.target.value })}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            {/* Due date */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
              <input
                type="date"
                className={`${fieldBaseClass} text-sm`}
                value={editState.dueDate}
                onChange={(e) => onEditUpdate({ dueDate: e.target.value })}
              />
            </div>
          </div>

          {/* Steps */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Test Steps ({editState.steps.length})</label>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {editState.steps.map((step, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 text-xs">
                  <div className="text-slate-400 font-medium mb-1">Step {idx + 1}</div>
                  <input
                    className={`${fieldBaseClass} text-xs mb-1.5`}
                    placeholder="Action / what to do"
                    value={step.description}
                    onChange={(e) => onStepUpdate(idx, 'description', e.target.value)}
                  />
                  <input
                    className={`${fieldBaseClass} text-xs`}
                    placeholder="Expected result"
                    value={step.expectedResult}
                    onChange={(e) => onStepUpdate(idx, 'expectedResult', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Countries */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Countries to assign</label>
            <div className="flex flex-wrap gap-2">
              {countries.filter(c => c.code !== 'ALL').map((c) => {
                const selected = editState.countries.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => onEditUpdate({
                      countries: selected
                        ? editState.countries.filter((x) => x !== c.code)
                        : [...editState.countries, c.code]
                    })}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${selected ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}
                  >
                    {c.code}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assignees per country */}
          {editState.countries.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Assign stakeholders</label>
              <div className="space-y-2">
                {editState.countries.map((code) => {
                  const eligible = stakeholders.filter((s) => s.countryCode === code);
                  return (
                    <div key={code} className="flex items-center gap-3">
                      <span className="text-xs font-mono font-semibold text-slate-500 w-8">{code}</span>
                      <select
                        className={`${selectBaseClass} text-xs flex-1`}
                        value={editState.assigneeByCountry[code] ?? ''}
                        onChange={(e) => onEditUpdate({
                          assigneeByCountry: { ...editState.assigneeByCountry, [code]: e.target.value }
                        })}
                      >
                        <option value="">— Unassigned —</option>
                        {eligible.map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-slate-200">
            <button
              onClick={onApprove}
              disabled={submitting || editState.countries.length === 0}
              className={`${primaryButtonClass} flex items-center gap-2 text-sm`}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Approve & Create Task
            </button>

            {showRejectInput ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  placeholder="Reason for rejection (optional)"
                  className={`${fieldBaseClass} text-sm flex-1`}
                  value={rejectReason}
                  onChange={(e) => onRejectReasonChange(e.target.value)}
                  autoFocus
                />
                <button
                  onClick={onReject}
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Confirm Reject
                </button>
                <button onClick={onToggleRejectInput} className="text-slate-400 hover:text-slate-600 text-xs">Cancel</button>
              </div>
            ) : (
              <button
                onClick={onToggleRejectInput}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:border-rose-200 hover:text-rose-600 text-slate-500 text-sm transition-colors"
              >
                <X size={14} /> Reject
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
