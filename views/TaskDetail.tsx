'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Task, Status, User, Role, TestStep, Priority, AdminProductConfig } from '../types';
import { Badge } from '../components/Badge';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ArrowLeft, Send, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Database, Image as ImageIcon, Link as LinkIcon, User as UserIcon, Rocket, Globe, Calendar, Lock, PenTool, Monitor, FileText, ExternalLink, X, Printer, Trash2, Loader2, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../lib/http';
import { notify } from '../lib/notify';
import { ApiError } from '../lib/http';
import { isValidJiraTicket, normalizeJiraTicketInput } from '../lib/taskValidation';
import { resolveMentionUserIds } from '../lib/mentions';

interface TaskDetailProps {
  task: Task;
  currentUser: User;
  initialStepOrder?: number | null;
  initialCommentId?: string | null;
  onBack: () => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

interface TaskHistoryEntry {
  id: string;
  action: string;
  message: string;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface GroupUpdatePreview {
  enabled: boolean;
  reason?: string;
  total: number;
  updatable: number;
  signedOffLocked: number;
  countries: string[];
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const renderTextWithLinks = (text?: string) => {
  if (!text) return null;
  const parts = text.split(URL_REGEX);
  return parts.map((part, index) => {
    if (part.match(URL_REGEX)) {
      return (
        <a
          key={`${part}-${index}`}
          href={part}
          target="_blank"
          rel="noreferrer"
          className="text-blue-600 hover:underline break-all"
        >
          {part}
        </a>
      );
    }
    return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
};

// Defensive normalization: API/DB may omit arrays or return null
const normalizeTask = (t: Task): Task => {
  const steps = Array.isArray((t as any).steps) ? (t as any).steps : [];
  const normalizedSteps = steps
    .map((s: any) => ({
      ...s,
      attachments: Array.isArray(s?.attachments) ? s.attachments : [],
      comments: Array.isArray(s?.comments) ? s.comments : [],
    }))
    .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  return {
    ...t,
    steps: normalizedSteps
  } as Task;
};

const toDateInputValue = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const fromDateInputValue = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
};

const formatDateOnly = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const formatDateTimeLocal = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const getJiraUrl = (raw?: string) => {
  const ticket = normalizeJiraTicketInput(raw);
  if (!ticket) return '';
  return `https://dkshdigital.atlassian.net/browse/${ticket}`;
};

const getStepOutcome = (step: TestStep): 'PASSED' | 'FAILED' | 'CONDITIONAL' | null => {
  if (step.stepResult === 'PASSED' || step.stepResult === 'FAILED' || step.stepResult === 'CONDITIONAL') {
    return step.stepResult;
  }
  if (step.isPassed === true) return 'PASSED';
  if (step.isPassed === false) return 'FAILED';
  return null;
};

const isStepResolved = (step: TestStep) => getStepOutcome(step) !== null;

const ISO_REQUIREMENTS = [
  'Only authorized users should access or modify data needed for development or enhancement.',
  'Production data should not be tampered with without proper authorization and business justification. Production data should not be improperly modified, either accidentally or maliciously.',
  'Only authorized users should access data whenever they need to do so, with proper approvals and audit trail.',
  'Production data copied into staging environment is only meant for testing purposes. The data should NOT be migrated back to production, and staging data should be protected with the same mechanism as production.',
  'Data held in staging or test environment are only for testing purposes and should not be used for any other purposes.',
  'During migration to production, any system downtime should be planned and communicated to affected users. If possible, it should not affect business use of the system.',
];

const IsoComplianceBanner: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 print:hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-blue-800">
          <ShieldCheck size={16} className="shrink-0 text-blue-600" />
          ISO 27001:2013 Data Handling Requirements
        </span>
        {expanded
          ? <ChevronUp size={16} className="shrink-0 text-blue-500" />
          : <ChevronDown size={16} className="shrink-0 text-blue-500" />}
      </button>
      {expanded && (
        <ul className="px-4 pb-4 space-y-2">
          {ISO_REQUIREMENTS.map((req, i) => (
            <li key={i} className="flex gap-2 text-sm text-blue-900">
              <span className="mt-0.5 shrink-0 text-blue-400">•</span>
              <span>{req}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const TaskDetail: React.FC<TaskDetailProps> = ({ task, currentUser, initialStepOrder = null, initialCommentId = null, onBack, onUpdateTask, onDeleteTask }) => {
  const [localTask, setLocalTask] = useState<Task>(() => normalizeTask(task));
  const [expandedStep, setExpandedStep] = useState<string | null>(() => {
    const safe = normalizeTask(task);
    return safe.steps.find((s) => !isStepResolved(s))?.id || safe.steps[0]?.id || null;
  });
  const [taskEdits, setTaskEdits] = useState({
    title: task.title ?? '',
    description: task.description ?? '',
    jiraTicket: task.jiraTicket ?? '',
    crNumber: task.crNumber ?? '',
    developer: task.developer ?? '',
    dueDate: toDateInputValue(task.dueDate),
    priority: task.priority ?? Priority.MEDIUM,
    productId: task.productId ?? '',
    featureModule: task.featureModule ?? '',
    targetSystemId: task.targetSystemId ?? '',
    assigneeId: task.assignee?.id ?? ''
  });
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepEdits, setStepEdits] = useState<{ [key: string]: Partial<TestStep> }>({});
  const [deploymentModalOpen, setDeploymentModalOpen] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [commentInputs, setCommentInputs] = useState<{[key: string]: string}>({});
  const [conditionalReasonInputs, setConditionalReasonInputs] = useState<Record<string, string>>({});
  const [stepSaveState, setStepSaveState] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [commentSaveState, setCommentSaveState] = useState<Record<string, 'idle' | 'saving' | 'saved' | 'error'>>({});
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [activeMentionStepId, setActiveMentionStepId] = useState<string | null>(null);
  const [markingCommentsRead, setMarkingCommentsRead] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const [signingOff, setSigningOff] = useState(false);
  const [emailingReport, setEmailingReport] = useState(false);
  const [taskMetaSaveState, setTaskMetaSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [taskMetaError, setTaskMetaError] = useState<string | null>(null);
  const [applyGlobalMetaUpdate, setApplyGlobalMetaUpdate] = useState(false);
  const [groupPreview, setGroupPreview] = useState<GroupUpdatePreview | null>(null);
  const [loadingGroupPreview, setLoadingGroupPreview] = useState(false);
  const [historyItems, setHistoryItems] = useState<TaskHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [uploadStepId, setUploadStepId] = useState<string | null>(null);
  const [mentionUsers, setMentionUsers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [products, setProducts] = useState<AdminProductConfig[]>([]);
  const [stakeholderOptions, setStakeholderOptions] = useState<Array<{ id: string; name: string; email: string; countryCode: string; productAccesses?: Array<{ id: string; name: string; slug: string }> }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentElementRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const commentDraftStorageKey = useMemo(
    () => `task-comment-drafts:${currentUser.id}:${task.id}`,
    [currentUser.id, task.id]
  );
  
  // Signature State
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {}
  });
  
  const isAdmin = currentUser.role === Role.ADMIN;
  const statusKey = (localTask.status ?? '').toString().trim().replace(/\s+/g, '_').toUpperCase();
  const isDeployed = localTask.status === Status.DEPLOYED;
  const isSignedOff = !!localTask.signedOff || !!localTask.signedOffAt;
  const isDraft = statusKey === 'DRAFT';
  const canRunTestActions = !isSignedOff && !isDraft;
  const canEditTaskMeta = isAdmin && !isSignedOff;
  const signedByLabel =
    localTask.signedOffBy?.name ||
    localTask.signedOffBy?.email ||
    localTask.signedOff?.signedBy ||
    'Stakeholder';
  const signedOnValue = localTask.signedOffAt || localTask.signedOff?.signedAt;
  const signedOnLabel = formatDateTimeLocal(signedOnValue ?? undefined);
  const currentProduct = products.find((product) => product.id === taskEdits.productId || product.id === localTask.productId) ?? null;
  const countryStakeholders = stakeholderOptions.filter(
    (user) =>
      user.countryCode === localTask.countryCode &&
      ((user.productAccesses ?? []).length === 0 ||
        (taskEdits.productId ? (user.productAccesses ?? []).some((access) => access.id === taskEdits.productId) : true))
  );
  const moduleOptions = Array.from(new Set([...(currentProduct?.modules.map((module) => module.name) || availableModules || []), localTask.featureModule || ''])).filter(Boolean);
  const targetSystemOptions = currentProduct?.targetSystems ?? [];
  const canUnassign = isDraft;

  // Portal URL Logic
  const portalUrl = localTask.targetSystemUrl || '#';

  const normalizeMentionSearch = (value: string) =>
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\s._-]+/g, '');

  const getMentionContext = (value: string) => {
    const match = value.match(/(^|\s)(@\{[^}]*\}|@[^\s@{}]*)$/);
    if (!match || typeof match.index !== 'number') return null;
    const start = match.index + match[1].length;
    const end = value.length;
    const raw = match[2] || '';
    const query = raw
      .replace(/^@\{?/, '')
      .replace(/\}$/, '')
      .toLowerCase();
    return { start, end, query };
  };

  const mentionNameByToken = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of mentionUsers) {
      const cleanName = (user.name || '').trim();
      const cleanEmail = (user.email || '').trim().toLowerCase();
      if (cleanEmail) {
        map.set(cleanEmail, cleanName || user.email);
      }
      if (cleanName) {
        map.set(cleanName.toLowerCase(), cleanName);
      }
    }
    return map;
  }, [mentionUsers]);

  const renderCommentBody = (value: string) => {
    const parts = value.split(/(@\{[^}]+\}|@[^\s@{}]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@{') && part.endsWith('}')) {
        const token = part.slice(2, -1).trim().toLowerCase();
        const display = mentionNameByToken.get(token) || 'User';
        return (
          <span key={`${part}-${idx}`} className="font-semibold text-indigo-700">
            @{display}
          </span>
        );
      }
      if (part.startsWith('@')) {
        const token = part.slice(1).trim().toLowerCase();
        const display = mentionNameByToken.get(token);
        if (display) {
          return (
            <span key={`${part}-${idx}`} className="font-semibold text-indigo-700">
              @{display}
            </span>
          );
        }
      }
      return <React.Fragment key={`${part}-${idx}`}>{part}</React.Fragment>;
    });
  };

  // Handle Step Updates
  const persistStepProgress = async (
    stepId: string,
    updates: Partial<TestStep>,
    expectedUpdatedAt: string = localTask.updatedAt,
    hasRetried = false
  ) => {
    setStepSaveState((prev) => ({ ...prev, [stepId]: 'saving' }));
    const response = await fetch(`/api/tasks/${localTask.id}/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stepResult: updates.stepResult,
        conditionalReason: updates.conditionalReason,
        isPassed: updates.isPassed,
        actualResult: updates.actualResult,
        attachments: updates.attachments,
        expectedUpdatedAt
      })
    });
    if (response.status === 409) {
      const latest = await refreshTask(localTask.id, { silentOnError: true });
      if (!hasRetried && latest?.updatedAt) {
        // Re-apply optimistic update on top of refreshed server state so the UI
        // doesn't flicker back (e.g. a step tick disappearing while the retry fires).
        const reOptimised = {
          ...latest,
          steps: (latest.steps ?? []).map((s) => s.id === stepId ? { ...s, ...updates } : s),
        };
        setLocalTask(reOptimised);
        onUpdateTask(reOptimised);
        return persistStepProgress(stepId, updates, latest.updatedAt, true);
      }
      notify('Task changed by another user. Reloaded latest data.', 'error');
      setStepSaveState((prev) => ({ ...prev, [stepId]: 'error' }));
      return false;
    }
    if (!response.ok) {
      setStepSaveState((prev) => ({ ...prev, [stepId]: 'error' }));
      notify('Failed to save step updates', 'error');
      return false;
    }
    setStepSaveState((prev) => ({ ...prev, [stepId]: 'saved' }));
    window.setTimeout(() => {
      setStepSaveState((prev) => ({ ...prev, [stepId]: 'idle' }));
    }, 1200);
    return true;
  };

  const handleStepUpdate = (stepId: string, updates: Partial<TestStep>) => {
    if (!canRunTestActions) return;

    const updatedSteps = (localTask.steps ?? []).map(step => {
      if (step.id === stepId) {
        const nextOutcome =
          updates.stepResult ??
          (updates.isPassed === true ? 'PASSED' : updates.isPassed === false ? 'FAILED' : null);
        return { 
          ...step, 
          ...updates, 
          completedAt: nextOutcome ? new Date().toLocaleString() : undefined 
        };
      }
      return step;
    });

    const previousStatus = localTask.status;
    const updatedTask = { ...localTask, steps: updatedSteps };
    
    // Auto-update task status from step execution.
    // Task should only become PASSED after explicit sign-off.
    const outcomes = updatedSteps.map(getStepOutcome);
    const allPassed = outcomes.length > 0 && outcomes.every((outcome) => outcome === 'PASSED');
    if (allPassed && localTask.status !== Status.DEPLOYED) {
      updatedTask.status = Status.IN_PROGRESS;
    } else if (outcomes.some((outcome) => outcome === 'FAILED')) {
      updatedTask.status = Status.FAILED;
    } else if (outcomes.some((outcome) => outcome === 'PASSED' || outcome === 'CONDITIONAL') && statusKey === 'READY') {
      updatedTask.status = Status.IN_PROGRESS;
    }

    setLocalTask(updatedTask);
    onUpdateTask(updatedTask);

    if (updatedTask.status !== previousStatus) {
      const failedStepOrder =
        (updates.stepResult === 'FAILED' || updates.isPassed === false)
          ? (localTask.steps ?? []).find((step) => step.id === stepId)?.order
          : undefined;
      void persistStatus(updatedTask.status, failedStepOrder);
    }
    if (!isAdmin) {
      void persistStepProgress(stepId, updates);
    }

    // Auto-advance logic
    if (updates.stepResult === 'PASSED' || updates.isPassed === true) {
        const currentIndex = localTask.steps.findIndex(s => s.id === stepId);
        const nextStep = localTask.steps[currentIndex + 1];
        if (nextStep) {
            setExpandedStep(nextStep.id);
        } else {
            setExpandedStep(null); // Close if last step
        }
    }
  };

  const deleteAttachment = (stepId: string, index: number) => {
    if (!canRunTestActions) return;
    const currentStep = (localTask.steps ?? []).find(s => s.id === stepId);
    if (!currentStep || !currentStep.attachments) return;
    
    const newAttachments = [...currentStep.attachments];
    newAttachments.splice(index, 1);
    handleStepUpdate(stepId, { attachments: newAttachments });
  };

  const handleAddComment = async (stepId: string, expectedUpdatedAt: string = localTask.updatedAt, hasRetried = false) => {
    if (!canRunTestActions) return;
    const text = commentInputs[stepId];
    if (!text || !text.trim()) return;
    setCommentSaveState((prev) => ({ ...prev, [stepId]: 'saving' }));
    const stepOrder = (localTask.steps ?? []).find((step) => step.id === stepId)?.order;
    const mentionUserIds = resolveMentionUserIds(text, mentionUsers);
    const response = await fetch(`/api/tasks/${localTask.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: text,
        stepOrder,
        expectedUpdatedAt,
        mentionUserIds
      })
    });

    if (response.status === 409) {
      const latest = await refreshTask(localTask.id, { silentOnError: true });
      if (!hasRetried && latest?.updatedAt) {
        return handleAddComment(stepId, latest.updatedAt, true);
      }
      notify('Task changed by another user. Reloaded latest data.', 'error');
      setCommentSaveState((prev) => ({ ...prev, [stepId]: 'error' }));
      return;
    }
    if (!response.ok) {
      notify('Failed to add comment', 'error');
      setCommentSaveState((prev) => ({ ...prev, [stepId]: 'error' }));
      return;
    }

    await refreshTask(localTask.id);
    setCommentInputs((prev) => ({ ...prev, [stepId]: '' }));
    setCommentSaveState((prev) => ({ ...prev, [stepId]: 'saved' }));
    window.setTimeout(() => {
      setCommentSaveState((prev) => ({ ...prev, [stepId]: 'idle' }));
    }, 1200);
    notify('Comment added', 'success');
  };

  const handleOpenUpload = (stepId: string) => {
    setUploadStepId(stepId);
    fileInputRef.current?.click();
  };

  const handleInsertMention = (stepId: string, mentionToken: string) => {
    const currentValue = commentInputs[stepId] || '';
    const ctx = getMentionContext(currentValue);
    if (!ctx) return;
    const nextValue = `${currentValue.slice(0, ctx.start)}@{${mentionToken}} ${currentValue.slice(ctx.end)}`;
    setCommentInputs((prev) => ({ ...prev, [stepId]: nextValue }));
  };

  const handleMarkTaskCommentsRead = async () => {
    try {
      setMarkingCommentsRead(true);
      const response = await fetch(`/api/tasks/${localTask.id}/comments/read`, { method: 'POST' });
      if (!response.ok) {
        notify('Failed to mark discussions as read', 'error');
        return;
      }
      notify('Discussions marked as read', 'success');
    } finally {
      setMarkingCommentsRead(false);
    }
  };

  const optimizeImageBlob = async (blob: Blob) => {
    const imageBitmap = await createImageBitmap(blob);
    const maxWidth = 1600;
    const maxHeight = 1600;
    const scale = Math.min(1, maxWidth / imageBitmap.width, maxHeight / imageBitmap.height);
    const width = Math.max(1, Math.round(imageBitmap.width * scale));
    const height = Math.max(1, Math.round(imageBitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      imageBitmap.close();
      throw new Error('Failed to get 2D canvas context');
    }
    context.drawImage(imageBitmap, 0, 0, width, height);
    imageBitmap.close();
    return canvas.toDataURL('image/jpeg', 0.78);
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadStepId) return;
    void (async () => {
      try {
        const optimized = await optimizeImageBlob(file);
        const currentStep = (localTask.steps ?? []).find((step) => step.id === uploadStepId);
        if (currentStep) {
          const currentAttachments = currentStep.attachments || [];
          handleStepUpdate(uploadStepId, { attachments: [...currentAttachments, optimized] });
        }
      } catch {
        notify('Failed to process image', 'error');
      }
    })();
    e.target.value = '';
  };

  // Paste handler for screenshots
  const handlePaste = (e: React.ClipboardEvent, stepId: string) => {
    if (!canRunTestActions) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            if (blob) {
              void (async () => {
                try {
                  const optimized = await optimizeImageBlob(blob);
                  const currentStep = (localTask.steps ?? []).find((s) => s.id === stepId);
                  if (currentStep) {
                    const currentAttachments = currentStep.attachments || [];
                    handleStepUpdate(stepId, { attachments: [...currentAttachments, optimized] });
                  }
                } catch {
                  notify('Failed to process pasted image', 'error');
                }
              })();
            }
            e.preventDefault(); // Prevent pasting into text inputs if focused
        }
    }
  };

  const handleSignOff = () => {
    if (!canRunTestActions) return;
    if (!signatureData || !acknowledged) return;
    void (async () => {
      setSigningOff(true);
      const statusUpdated = await persistStatus(Status.PASSED);
      if (!statusUpdated) {
        setSigningOff(false);
        return;
      }
      const response = await fetch(`/api/tasks/${localTask.id}/signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureData,
          expectedUpdatedAt: localTask.updatedAt
        })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        notify(data?.error || 'Failed to sign off task', 'error');
        await refreshTask(localTask.id);
        setSigningOff(false);
        return;
      }
      await refreshTask(localTask.id);
      setSigningOff(false);
      notify('Task signed off successfully.', 'success');
    })();
  };

  const handleDeploy = () => {
    const deployedTask: Task = {
      ...localTask,
      status: Status.DEPLOYED,
      deployment: {
        isDeployed: true,
        deployedAt: new Date().toLocaleDateString(),
        deployedBy: currentUser.name,
        releaseVersion: releaseVersion || 'v1.0.0'
      }
    };
    setLocalTask(deployedTask);
    onUpdateTask(deployedTask);
    void persistStatus(deployedTask.status);
    setDeploymentModalOpen(false);
  };

  const handleMarkReady = () => {
    if (!isAdmin || isSignedOff || !isDraft) return;
    void (async () => {
      if (!localTask.assignee?.id) {
        notify('Assign a stakeholder before marking task as READY.', 'error');
        return;
      }
      setMarkingReady(true);
      const statusUpdated = await persistStatus('READY' as unknown as Status);
      if (!statusUpdated) {
        setMarkingReady(false);
        return;
      }
      await refreshTask(localTask.id);
      setMarkingReady(false);
    })();
  };

  const handlePrint = () => {
      const reportUrl = `/api/tasks/${localTask.id}/signoff-report?autoprint=1`;
      const reportWindow = window.open(reportUrl, '_blank', 'noopener,noreferrer');
      if (!reportWindow) {
        notify('Unable to open report window. Please allow pop-ups for this site.', 'error');
        return;
      }
      reportWindow.focus();
  };

  const handleEmailReport = () => {
    void (async () => {
      setEmailingReport(true);
      try {
        const response = await fetch(`/api/tasks/${localTask.id}/signoff-report/email`, {
          method: 'POST'
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          notify(data?.error || 'Failed to email report', 'error');
          return;
        }
        notify('Report email sent to your inbox.', 'success');
      } finally {
        setEmailingReport(false);
      }
    })();
  };

  const handleDeleteTask = async () => {
    if (!isAdmin) return;
    setConfirmDialog({
      open: true,
      title: 'Delete Task',
      message: 'Delete this task? This action cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        const response = await fetch(`/api/tasks/${localTask.id}`, { method: 'DELETE' });
        if (!response.ok) return;
        onDeleteTask(localTask.id);
      }
    });
  };

  const refreshTask = async (taskId: string, options?: { silentOnError?: boolean }) => {
    try {
      const updated = await apiFetch<Task>(`/api/tasks/${taskId}`, { cache: 'no-store' });
      const safeUpdated = normalizeTask(updated as Task);
      setLocalTask(safeUpdated);
      onUpdateTask(safeUpdated);
      void fetch(`/api/tasks/${taskId}/comments/read`, { method: 'POST' });
      return safeUpdated;
    } catch (error) {
      if (options?.silentOnError) return null;
      if (error instanceof ApiError) {
        notify(error.message || 'Failed to refresh task', 'error');
        return null;
      }
      notify('Failed to refresh task', 'error');
      return null;
    }
  };

  const refreshHistory = async (taskId: string) => {
    setLoadingHistory(true);
    try {
      const history = await apiFetch<TaskHistoryEntry[]>(`/api/tasks/${taskId}/history`, { cache: 'no-store' });
      setHistoryItems(Array.isArray(history) ? history : []);
    } catch {
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const persistStatus = async (
    status: Status,
    stepOrder?: number,
    expectedUpdatedAt: string = localTask.updatedAt,
    hasRetried = false
  ) => {
    const response = await fetch(`/api/tasks/${localTask.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, stepOrder, expectedUpdatedAt })
    });
    if (response.status === 409) {
      const latest = await refreshTask(localTask.id, { silentOnError: true });
      if (!hasRetried && latest?.updatedAt) {
        // Re-apply optimistic status on top of refreshed server state before retrying.
        const reOptimised = { ...latest, status };
        setLocalTask(reOptimised);
        onUpdateTask(reOptimised);
        return persistStatus(status, stepOrder, latest.updatedAt, true);
      }
      notify('Task changed by another user. Reloaded latest data.', 'error');
      return false;
    }
    return response.ok;
  };

  const handleSaveTaskMeta = async () => {
    if (!canEditTaskMeta) return;
    if (!isTaskMetaDirty) return;
    const trimmedTitle = taskEdits.title.trim();
    const normalizedTicket = normalizeJiraTicketInput(taskEdits.jiraTicket);
    if (!trimmedTitle) {
      notify('Title is required', 'error');
      return;
    }
    if (trimmedTitle.length > 200) {
      notify('Title is too long', 'error');
      return;
    }
    if (!isValidJiraTicket(taskEdits.jiraTicket)) {
      notify('Invalid Jira ticket format', 'error');
      return;
    }

    const performSave = async () => {
      setTaskMetaSaveState('saving');
      setTaskMetaError(null);
      const currentAssigneeId = localTask.assignee?.id ?? '';
      const requestedAssigneeId = taskEdits.assigneeId ?? '';
      const includeAssigneePatch =
        requestedAssigneeId !== currentAssigneeId &&
        (requestedAssigneeId !== '' || canUnassign);
      const response = await fetch(`/api/tasks/${localTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          description: taskEdits.description,
          jiraTicket: normalizedTicket,
          crNumber: taskEdits.crNumber,
          developer: taskEdits.developer,
          dueDate: fromDateInputValue(taskEdits.dueDate),
          priority: taskEdits.priority,
          productId: taskEdits.productId,
          module: taskEdits.featureModule,
          targetSystemId: taskEdits.targetSystemId || null,
          ...(includeAssigneePatch ? { assigneeId: requestedAssigneeId || null } : {}),
          expectedUpdatedAt: localTask.updatedAt,
          applyToGroup: applyGlobalMetaUpdate
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const message = data?.error || 'Failed to save task details';
        setTaskMetaError(message);
        setTaskMetaSaveState('error');
        return;
      }
      const updated = await response.json();
      const safeUpdated = normalizeTask(updated as Task);
      setLocalTask(safeUpdated);
      onUpdateTask(safeUpdated);
      setTaskMetaError(null);
      setTaskEdits({
        title: safeUpdated.title ?? '',
        description: safeUpdated.description ?? '',
        jiraTicket: safeUpdated.jiraTicket ?? '',
        crNumber: safeUpdated.crNumber ?? '',
        developer: safeUpdated.developer ?? '',
        dueDate: toDateInputValue(safeUpdated.dueDate),
        priority: safeUpdated.priority ?? Priority.MEDIUM,
        productId: safeUpdated.productId ?? '',
        featureModule: safeUpdated.featureModule ?? '',
        targetSystemId: safeUpdated.targetSystemId ?? '',
        assigneeId: safeUpdated.assignee?.id ?? ''
      });
      const summary = (updated as any)?.globalUpdateSummary;
      if (summary?.requested) {
        notify(
          `Global update: ${summary.updated}/${summary.total} tasks updated` +
            (summary.skippedSignedOff > 0 ? `, ${summary.skippedSignedOff} signed-off skipped.` : '.'),
          'success'
        );
        if (summary.skippedSignedOff > 0 && Array.isArray(summary.skipped)) {
          const skippedCountries = summary.skipped.map((item: any) => item.countryCode).join(', ');
          setConfirmDialog({
            open: true,
            title: 'Global Update: Skipped Markets',
            message: skippedCountries
              ? `Signed-off tasks were skipped for: ${skippedCountries}.`
              : 'Some signed-off tasks were skipped.',
            confirmLabel: 'Got it',
            onConfirm: () => {}
          });
        }
      } else {
        notify('Task details saved', 'success');
      }
      setTaskMetaSaveState('saved');
      window.setTimeout(() => setTaskMetaSaveState('idle'), 1600);
    };

    if (applyGlobalMetaUpdate && groupPreview?.enabled) {
      setConfirmDialog({
        open: true,
        title: 'Apply Global Update',
        message:
          `Apply these updates to ${groupPreview.total} tasks (${groupPreview.updatable} editable, ${groupPreview.signedOffLocked} signed-off locked)? ` +
          `Markets: ${groupPreview.countries.join(', ')}`,
        confirmLabel: 'Apply to all',
        onConfirm: async () => {
          await performSave();
        }
      });
      return;
    }

    await performSave();
  };

  const isTaskMetaDirty =
    (taskEdits.jiraTicket ?? '') !== (localTask.jiraTicket ?? '') ||
    (taskEdits.developer ?? '') !== (localTask.developer ?? '') ||
    (taskEdits.featureModule ?? '') !== (localTask.featureModule ?? '') ||
    (taskEdits.assigneeId ?? '') !== (localTask.assignee?.id ?? '') ||
    taskEdits.priority !== (localTask.priority ?? Priority.MEDIUM) ||
    (taskEdits.dueDate ?? '') !== toDateInputValue(localTask.dueDate) ||
    (localTask.title ?? '') !== taskEdits.title ||
    (localTask.description ?? '') !== taskEdits.description ||
    (localTask.crNumber ?? '') !== taskEdits.crNumber;

  const handleBackClick = () => {
    if (canEditTaskMeta && isTaskMetaDirty) {
      setConfirmDialog({
        open: true,
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Leave this page without saving?',
        confirmLabel: 'Leave',
        onConfirm: () => onBack()
      });
      return;
    }
    onBack();
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (canEditTaskMeta && isTaskMetaDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [canEditTaskMeta, isTaskMetaDirty]);

  const handleAddStep = async () => {
    const response = await fetch(`/api/tasks/${localTask.id}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'New step',
        expectedResult: 'Expected outcome',
        testData: '',
        expectedUpdatedAt: localTask.updatedAt
      })
    });

    if (!response.ok) return;
    await refreshTask(localTask.id);
  };

  const startEditStep = (step: TestStep) => {
    setEditingStepId(step.id);
    setStepEdits((prev) => ({
      ...prev,
      [step.id]: {
        description: step.description,
        expectedResult: step.expectedResult,
        testData: step.testData ?? ''
      }
    }));
  };

  const handleSaveStep = async (stepId: string) => {
    const edits = stepEdits[stepId];
    const response = await fetch(`/api/tasks/${localTask.id}/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: edits?.description,
        expectedResult: edits?.expectedResult,
        testData: edits?.testData,
        expectedUpdatedAt: localTask.updatedAt
      })
    });

    if (!response.ok) return;
    setEditingStepId(null);
    await refreshTask(localTask.id);
  };

  const handleDeleteStep = async (stepId: string) => {
    setConfirmDialog({
      open: true,
      title: 'Delete Step',
      message: 'Delete this step?',
      confirmLabel: 'Delete',
      destructive: true,
      onConfirm: async () => {
        const response = await fetch(`/api/tasks/${localTask.id}/steps/${stepId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedUpdatedAt: localTask.updatedAt })
        });
        if (!response.ok) return;
        await refreshTask(localTask.id);
      }
    });
  };

  useEffect(() => {
    const safe = normalizeTask(task);
    setLocalTask(safe);
    setTaskEdits({
      title: safe.title ?? '',
      description: safe.description ?? '',
      jiraTicket: safe.jiraTicket ?? '',
      crNumber: safe.crNumber ?? '',
      developer: safe.developer ?? '',
      dueDate: toDateInputValue(safe.dueDate),
      priority: safe.priority ?? Priority.MEDIUM,
      productId: safe.productId ?? '',
      featureModule: safe.featureModule ?? '',
      targetSystemId: safe.targetSystemId ?? '',
      assigneeId: safe.assignee?.id ?? ''
    });
    setTaskMetaError(null);
    const needsHydration =
      (safe.steps ?? []).length === 0 ||
      (safe.steps ?? []).some(
        (step) =>
          !step.description &&
          !step.expectedResult &&
          !step.testData &&
          !step.actualResult &&
          (step.attachments?.length ?? 0) === 0 &&
          (step.comments?.length ?? 0) === 0
      );
    if (needsHydration) {
      void refreshTask(safe.id);
    }
    if (safe && isAdmin) {
      void refreshHistory(safe.id);
    } else {
      setHistoryItems([]);
    }
  }, [task.id, isAdmin]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(commentDraftStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (!parsed || typeof parsed !== 'object') return;
      setCommentInputs(parsed);
    } catch {
      setCommentInputs({});
    }
  }, [commentDraftStorageKey]);

  useEffect(() => {
    try {
      const entries = Object.entries(commentInputs).filter(([, value]) => (value ?? '').trim().length > 0);
      if (entries.length === 0) {
        window.localStorage.removeItem(commentDraftStorageKey);
        return;
      }
      window.localStorage.setItem(commentDraftStorageKey, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // ignore storage errors
    }
  }, [commentDraftStorageKey, commentInputs]);

  useEffect(() => {
    if (!initialStepOrder) return;
    const target = (localTask.steps ?? []).find((step) => step.order === initialStepOrder);
    if (target?.id) {
      setExpandedStep(target.id);
    }
  }, [initialStepOrder, localTask.steps]);

  useEffect(() => {
    if (!initialCommentId) return;
    const located = (localTask.steps ?? []).find((step) => (step.comments ?? []).some((comment) => comment.id === initialCommentId));
    if (!located?.id) return;

    setExpandedStep(located.id);
    window.setTimeout(() => {
      const node = commentElementRefs.current[initialCommentId];
      if (!node) return;
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedCommentId(initialCommentId);
      window.setTimeout(() => {
        setHighlightedCommentId((current) => (current === initialCommentId ? null : current));
      }, 4500);
    }, 120);
  }, [initialCommentId, localTask.steps]);

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    const loadGroupPreview = async () => {
      setLoadingGroupPreview(true);
      try {
        const data = await apiFetch<GroupUpdatePreview>(`/api/tasks/${localTask.id}/group-preview`, { cache: 'no-store' });
        if (!active) return;
        setGroupPreview(data);
      } catch {
        if (!active) return;
        setGroupPreview(null);
      } finally {
        if (active) setLoadingGroupPreview(false);
      }
    };
    void loadGroupPreview();
    return () => {
      active = false;
    };
  }, [isAdmin, localTask.id]);

  useEffect(() => {
    if (!groupPreview?.enabled) {
      setApplyGlobalMetaUpdate(false);
    }
  }, [groupPreview?.enabled]);

  useEffect(() => {
    const loadMentionUsers = async () => {
      const response = await fetch('/api/users/mentions', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data)) {
        setMentionUsers(data);
      }
    };
    void loadMentionUsers();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const loadAdminOptions = async () => {
      const [configRes, modulesRes, stakeholdersRes] = await Promise.all([
        fetch('/api/admin/task-config', { cache: 'no-store' }),
        fetch('/api/admin/modules', { cache: 'no-store' }),
        fetch('/api/admin/stakeholders', { cache: 'no-store' })
      ]);
      if (configRes.ok) {
        const config = await configRes.json();
        if (Array.isArray(config)) setProducts(config);
      }
      if (modulesRes.ok) {
        const modules = await modulesRes.json();
        if (Array.isArray(modules)) setAvailableModules(modules);
      }
      if (stakeholdersRes.ok) {
        const stakeholders = await stakeholdersRes.json();
        if (Array.isArray(stakeholders)) setStakeholderOptions(stakeholders);
      }
    };
    void loadAdminOptions();
  }, [isAdmin]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const step of localTask.steps ?? []) {
      next[step.id] = conditionalReasonInputs[step.id] ?? (step.conditionalReason ?? '');
    }
    setConditionalReasonInputs(next);
  }, [localTask.id, localTask.steps]);

  return (
    <div className="max-w-5xl mx-auto animate-fade-in pb-20 print:p-0 print:max-w-none">
      
      {/* Header Nav */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <button 
          onClick={() => void handleBackClick()}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={18} /> Back
        </button>
        <div className="flex items-center gap-2">
          {isAdmin && isDraft && !isSignedOff && (
            <button
              onClick={handleMarkReady}
              disabled={markingReady}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {markingReady ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {markingReady ? 'Marking as READY...' : 'Mark as READY'}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={handleDeleteTask}
              className="flex items-center gap-2 px-4 py-2 bg-white text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors shadow-sm"
            >
              <Trash2 size={16} /> Delete Task
            </button>
          )}
          {isAdmin && !isDeployed && localTask.status === Status.PASSED && (
            <button 
              onClick={() => setDeploymentModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
            >
              <Rocket size={16} /> Deploy Feature
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {isDraft && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
            This task is in Draft. Stakeholders can view it, but testing actions are locked until admin marks it as READY.
          </div>
        )}

        {/* ISO 27001:2013 Compliance Notice */}
        <IsoComplianceBanner />
          
        {/* Task Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative overflow-hidden print:border-0 print:shadow-none">
          {isDeployed && (
            <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg z-10 print:hidden">
              DEPLOYED {localTask.deployment?.deployedAt}
            </div>
          )}
          
          <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex flex-wrap gap-2">
                <Badge type="product" value={localTask.productName || 'EasyOrder'} />
                <Badge type="module" value={localTask.featureModule} />
                {isAdmin && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-50 text-sky-700 border border-sky-100">
                    Country: {localTask.countryCode}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${localTask.scope === 'Global' ? 'bg-purple-50 text-purple-700 border-purple-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  <Globe size={12} /> {localTask.scope}
                </span>
                {localTask.crNumber && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-orange-50 text-orange-700 border border-orange-100">
                        <FileText size={12} /> {localTask.crNumber}
                    </span>
                )}
              </div>
              <Badge type="status" value={localTask.status} />
          </div>

          <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
            <div>
                 {canEditTaskMeta ? (
                   <div className="space-y-2">
                     <input
                       className="w-full text-2xl font-bold text-slate-900 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-2.5 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                       value={taskEdits.title}
                       onChange={(e) => setTaskEdits({ ...taskEdits, title: e.target.value })}
                     />
                     <textarea
                       className="w-full text-slate-700 bg-slate-50/80 border border-slate-200 rounded-xl px-4 py-3 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors min-h-[90px]"
                       value={taskEdits.description}
                       onChange={(e) => setTaskEdits({ ...taskEdits, description: e.target.value })}
                     />
                   </div>
                 ) : (
                   <div>
                     <h1 className="text-2xl font-bold text-slate-900 mb-2">{localTask.title}</h1>
                     <p className="text-slate-600 whitespace-pre-wrap">{renderTextWithLinks(localTask.description)}</p>
                   </div>
                 )}
            </div>
            {/* Launch UAT Button - Hidden in Print */}
            {localTask.targetSystem && portalUrl !== '#' && (
              <a 
                  href={portalUrl} 
                  target="_blank" 
                  rel="noreferrer"
                  className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 bg-brand-600 text-white rounded-lg shadow-sm hover:bg-brand-700 transition-colors font-medium text-sm print:hidden"
              >
                  <Monitor size={18} /> Launch {localTask.targetSystem}
                  <ExternalLink size={14} className="opacity-70" />
              </a>
            )}
          </div>

          {/* Meta Data Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-400 block mb-1">Jira Ticket</span>
                {canEditTaskMeta ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                      value={taskEdits.jiraTicket}
                      onChange={(e) => setTaskEdits({ ...taskEdits, jiraTicket: e.target.value })}
                      placeholder="e.g. 3198 or EO-3198"
                    />
                    {taskEdits.jiraTicket && (
                      <a
                        href={getJiraUrl(taskEdits.jiraTicket)}
                        target="_blank"
                        rel="noreferrer"
                        className="h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-600 hover:text-blue-700 hover:border-slate-300 transition-colors"
                        title={`Open ${normalizeJiraTicketInput(taskEdits.jiraTicket)}`}
                        aria-label={`Open Jira ticket ${normalizeJiraTicketInput(taskEdits.jiraTicket)}`}
                      >
                        <LinkIcon size={14} />
                      </a>
                    )}
                  </div>
                ) : localTask.jiraTicket ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={getJiraUrl(localTask.jiraTicket)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                    >
                      <LinkIcon size={12}/> {normalizeJiraTicketInput(localTask.jiraTicket)}
                    </a>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full font-medium">
                      <CheckCircle size={11} /> Linked
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-slate-500">N/A</span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">CR No</span>
                {canEditTaskMeta ? (
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                    value={taskEdits.crNumber}
                    onChange={(e) => setTaskEdits({ ...taskEdits, crNumber: e.target.value })}
                  />
                ) : (
                  <span className="text-sm text-slate-700">{localTask.crNumber || 'N/A'}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Developer</span>
                {canEditTaskMeta ? (
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                    value={taskEdits.developer}
                    onChange={(e) => setTaskEdits({ ...taskEdits, developer: e.target.value })}
                  />
                ) : (
                  <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
                    <UserIcon size={12}/> {localTask.developer || 'Unassigned'}
                  </span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Due Date</span>
                {canEditTaskMeta ? (
                  <input
                    type="date"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                    value={taskEdits.dueDate}
                    onChange={(e) => setTaskEdits({ ...taskEdits, dueDate: e.target.value })}
                  />
                ) : (
                  <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
                    <Calendar size={12}/> {formatDateOnly(localTask.dueDate)}
                  </span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Priority</span>
                {canEditTaskMeta ? (
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                    value={taskEdits.priority}
                    onChange={(e) => setTaskEdits({ ...taskEdits, priority: e.target.value as Priority })}
                  >
                    <option value={Priority.HIGH}>High</option>
                    <option value={Priority.MEDIUM}>Medium</option>
                    <option value={Priority.LOW}>Low</option>
                  </select>
                ) : (
                  <Badge type="priority" value={localTask.priority} />
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Product</span>
                {canEditTaskMeta ? (
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                    value={taskEdits.productId}
                    onChange={(e) => {
                      const nextProduct = products.find((product) => product.id === e.target.value);
                      setTaskEdits({
                        ...taskEdits,
                        productId: e.target.value,
                        featureModule: nextProduct?.modules[0]?.name ?? '',
                        targetSystemId: nextProduct?.targetSystems[0]?.id ?? ''
                      });
                    }}
                  >
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-slate-700">{localTask.productName || 'EasyOrder'}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Module</span>
                {canEditTaskMeta ? (
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                    value={taskEdits.featureModule}
                    onChange={(e) => setTaskEdits({ ...taskEdits, featureModule: e.target.value })}
                  >
                    {moduleOptions.map((moduleName) => (
                      <option key={moduleName} value={moduleName}>
                        {moduleName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-slate-700">{localTask.featureModule}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Target System</span>
                {canEditTaskMeta ? (
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                    value={taskEdits.targetSystemId}
                    onChange={(e) => setTaskEdits({ ...taskEdits, targetSystemId: e.target.value })}
                  >
                    <option value="">None</option>
                    {targetSystemOptions.map((targetSystem) => (
                      <option key={targetSystem.id} value={targetSystem.id}>{targetSystem.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-slate-700">{localTask.targetSystem || 'N/A'}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Assignee</span>
                {canEditTaskMeta ? (
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 focus:bg-white focus:border-slate-300 focus:ring-0 transition-colors"
                    value={taskEdits.assigneeId}
                    onChange={(e) => setTaskEdits({ ...taskEdits, assigneeId: e.target.value })}
                  >
                    {canUnassign && <option value="">Unassigned</option>}
                    {countryStakeholders.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name || user.email}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-slate-700">{localTask.assignee?.name || localTask.assignee?.email || 'Unassigned'}</span>
                )}
              </div>
          </div>

          {isAdmin && (
            <div className="mt-4 flex justify-end">
              {canEditTaskMeta ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500" role="status" aria-live="polite">
                    {taskMetaSaveState === 'saving' && 'Saving...'}
                    {taskMetaSaveState === 'saved' && 'Saved'}
                    {taskMetaSaveState === 'error' && (taskMetaError || 'Save failed')}
                    {taskMetaSaveState === 'idle' && isTaskMetaDirty && 'Unsaved changes'}
                  </span>
                  <button
                  onClick={handleSaveTaskMeta}
                  disabled={!isTaskMetaDirty || taskMetaSaveState === 'saving'}
                  className="text-xs font-medium text-white bg-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-800 disabled:opacity-50"
                >
                  {taskMetaSaveState === 'saving' ? 'Saving...' : 'Save changes'}
                  </button>
                </div>
              ) : (
                <span className="text-xs font-medium text-slate-500">Task is signed off and locked.</span>
              )}
            </div>
          )}

          {isAdmin && canEditTaskMeta && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  checked={applyGlobalMetaUpdate}
                  onChange={(e) => setApplyGlobalMetaUpdate(e.target.checked)}
                  disabled={!groupPreview?.enabled || (groupPreview?.updatable ?? 0) === 0}
                />
                Apply supported fields to all markets in this task group
              </label>
              {loadingGroupPreview ? (
                <span>Checking group…</span>
              ) : groupPreview?.enabled ? (
                <span>
                  {groupPreview.total} tasks in group ({groupPreview.updatable} editable, {groupPreview.signedOffLocked} locked) — {groupPreview.countries.join(', ')}
                </span>
              ) : (
                <span>{groupPreview?.reason ?? 'No multi-market group for this task.'}</span>
              )}
            </div>
          )}
        </div>

        {isSignedOff && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            This task is signed off and now read-only. No further edits are allowed.
          </div>
        )}

        {/* Test Execution Accordion */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:border-0 print:shadow-none">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:bg-white print:border-b-2 print:border-slate-800">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <CheckCircle size={18} className="text-slate-400"/> Test Steps
            </h3>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
              {(localTask.steps ?? []).filter((s) => isStepResolved(s)).length} / {(localTask.steps ?? []).length} Steps Completed
              <button
                type="button"
                onClick={() => void handleMarkTaskCommentsRead()}
                disabled={markingCommentsRead}
                className="ml-2 px-2.5 py-1.5 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
              >
                {markingCommentsRead ? 'Marking...' : 'Mark discussions read'}
              </button>
              {isAdmin && (
                <button
                  onClick={handleAddStep}
                  className="ml-2 px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800 print:hidden"
                >
                  + Add Step
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
              {(localTask.steps ?? []).map((step, idx) => {
                const isOpen = expandedStep === step.id;
                const stepOutcome = getStepOutcome(step);
                const statusColor =
                  stepOutcome === 'PASSED'
                    ? 'bg-emerald-100 border-emerald-200 text-emerald-700'
                    : stepOutcome === 'FAILED'
                      ? 'bg-rose-100 border-rose-200 text-rose-700'
                      : stepOutcome === 'CONDITIONAL'
                        ? 'bg-amber-100 border-amber-200 text-amber-700'
                        : 'bg-white border-slate-200 text-slate-500';
                const commentDraft = commentInputs[step.id] || '';
                const mentionContext = activeMentionStepId === step.id ? getMentionContext(commentDraft) : null;
                const mentionSuggestions = mentionContext
                  ? mentionUsers
                      .filter((user) => {
                        const query = mentionContext.query;
                        if (!query) return true;
                        const normalizedQuery = normalizeMentionSearch(query);
                        const normalizedName = normalizeMentionSearch(user.name || '');
                        const normalizedEmail = normalizeMentionSearch(user.email || '');
                        return (
                          normalizedName.includes(normalizedQuery) ||
                          normalizedEmail.includes(normalizedQuery)
                        );
                      })
                      .slice(0, 6)
                  : [];
                
                return (
                  <div 
                    key={step.id} 
                    className={`transition-all outline-none ${isOpen ? 'bg-white' : 'bg-slate-50/30'} print:bg-white print:break-inside-avoid`}
                    onPaste={(e) => isOpen && handlePaste(e, step.id)}
                    tabIndex={isOpen ? 0 : -1}
                  >
                    {/* Step Header */}
                    <div 
                      onClick={() => setExpandedStep(isOpen ? null : step.id)}
                      className="p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 print:cursor-default"
                      role="button"
                      aria-expanded={isOpen}
                      aria-label={`Toggle Step ${idx + 1}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedStep(isOpen ? null : step.id);
                        }
                      }}
                    >
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold flex-shrink-0 ${statusColor}`}>
                          {stepOutcome === 'PASSED' ? <CheckCircle size={16}/> : stepOutcome === 'FAILED' ? <XCircle size={16}/> : stepOutcome === 'CONDITIONAL' ? <AlertCircle size={16}/> : idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                              {isAdmin && editingStepId === step.id ? (
                                <textarea
                                  className="min-h-[72px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus:border-brand-500 focus:ring-brand-500"
                                  rows={3}
                                  value={stepEdits[step.id]?.description ?? ''}
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                  onChange={(e) =>
                                    setStepEdits((prev) => ({
                                      ...prev,
                                      [step.id]: { ...prev[step.id], description: e.target.value }
                                    }))
                                  }
                                />
                              ) : (
                                <p className={`text-sm font-medium ${stepOutcome === 'PASSED' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                  {step.description}
                                </p>
                              )}
                              {stepOutcome === 'CONDITIONAL' && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                                  Conditional
                                </span>
                              )}
                          </div>
                          {step.completedAt && <p className="text-[10px] text-slate-400">Executed: {step.completedAt}</p>}
                        </div>
                        <div className="flex items-center gap-2 print:hidden">
                           {step.attachments && step.attachments.length > 0 && (
                               <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full" title="Attachments">
                                   <ImageIcon size={10}/> {step.attachments.length}
                               </span>
                           )}
                           {(step.comments ?? []).length > 0 && (
                             <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full" title="Comments">
                               <PenTool size={10}/> {(step.comments ?? []).length}
                             </span>
                           )}
                           {isAdmin && !isSignedOff && (
                             <div className="flex items-center gap-2">
                               <button
                                 onClick={(e) => { e.stopPropagation(); startEditStep(step); }}
                                 className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
                               >
                                 Edit
                               </button>
                               <button
                                 onClick={(e) => { e.stopPropagation(); handleDeleteStep(step.id); }}
                                 className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 hover:text-rose-700"
                               >
                                 Delete
                               </button>
                             </div>
                           )}
                           {isOpen ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronDown size={16} className="text-slate-400"/>}
                        </div>
                    </div>

                    {/* Expanded Content (Always expanded in print) */}
                    {(isOpen || isSignedOff) && (
                      <div className="px-4 pb-6 pt-0 animate-in slide-in-from-top-2">
                          <div className="ml-12 space-y-4">
                              {/* Expected vs Actual Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Left Col: Requirements */}
                                  <div className="space-y-4">
                                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 print:bg-white print:border-slate-300">
                                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 block">Expected Result</span>
                                          {isAdmin && editingStepId === step.id ? (
                                            <textarea
                                              className="w-full rounded-xl border-slate-300 bg-white text-sm text-slate-700 focus:border-brand-500 focus:ring-brand-500"
                                              rows={4}
                                              value={stepEdits[step.id]?.expectedResult ?? ''}
                                              onChange={(e) =>
                                                setStepEdits((prev) => ({
                                                  ...prev,
                                                  [step.id]: { ...prev[step.id], expectedResult: e.target.value }
                                                }))
                                              }
                                            />
                                          ) : (
                                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{renderTextWithLinks(step.expectedResult)}</p>
                                          )}
                                      </div>
                                      
                                      {(step.testData || (isAdmin && editingStepId === step.id)) && (
                                          <div>
                                              <span className="text-[10px] uppercase font-bold text-brand-600 tracking-wider mb-1 block flex items-center gap-1">
                                                  <Database size={10}/> Test Data
                                              </span>
                                              {isAdmin && editingStepId === step.id ? (
                                                <textarea
                                                  className="w-full rounded-xl border-slate-300 bg-white text-sm text-slate-700 focus:border-brand-500 focus:ring-brand-500"
                                                  rows={3}
                                                  value={stepEdits[step.id]?.testData ?? ''}
                                                  onChange={(e) =>
                                                    setStepEdits((prev) => ({
                                                      ...prev,
                                                      [step.id]: { ...prev[step.id], testData: e.target.value }
                                                    }))
                                                  }
                                                />
                                              ) : (
                                                <code className="text-xs bg-slate-50 px-2 py-1.5 rounded border border-slate-200 text-slate-700 block font-mono whitespace-pre-wrap">
                                                    {renderTextWithLinks(step.testData)}
                                                </code>
                                              )}
                                          </div>
                                      )}
                                  </div>

                                  {/* Right Col: Evidence & Actual */}
                                  <div className="space-y-3">
                                      {canRunTestActions ? (
                                        <div className="print:hidden">
                                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1 block">Actual Result</label>
                                            <textarea 
                                              className="w-full text-sm rounded-lg border-slate-300 focus:ring-brand-500 focus:border-brand-500 min-h-[60px]"
                                              placeholder="Describe observations..."
                                              value={step.actualResult || ''}
                                              onChange={(e) => handleStepUpdate(step.id, { actualResult: e.target.value })}
                                            />
                                        </div>
                                      ) : (
                                         step.actualResult && (
                                          <div className="bg-white p-3 rounded border border-slate-200 text-sm text-slate-700 italic">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1 block">Actual Result</span>
                                             "{step.actualResult}"
                                           </div>
                                         )
                                      )}

                                      {/* Screenshots */}
                                      <div>
                                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 block flex justify-between print:hidden">
                                              <span>Evidence</span>
                                              {canRunTestActions && <span className="font-normal text-[10px] normal-case text-slate-400">Ctrl+V to paste</span>}
                                          </label>
                                          
                                          {/* Thumbnails */}
                                          {step.attachments && step.attachments.length > 0 && (
                                              <div className="flex flex-wrap gap-2 mb-2">
                                                  {step.attachments.map((src, i) => (
                                                      <div key={i} className="relative w-16 h-16 rounded border border-slate-200 overflow-hidden group">
                                                          <img 
                                                            src={src} 
                                                            alt="Evidence" 
                                                            className="w-full h-full object-cover cursor-pointer" 
                                                            onClick={() => setViewImage(src)}
                                                          />
                                                          {canRunTestActions && (
                                                            <button 
                                                              onClick={(e) => { e.stopPropagation(); deleteAttachment(step.id, i); }}
                                                              className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                              aria-label={`Delete evidence ${i + 1} from Step ${idx + 1}`}
                                                            >
                                                              <X size={12} />
                                                            </button>
                                                          )}
                                                      </div>
                                                  ))}
                                              </div>
                                          )}

                                          {canRunTestActions && (
                                              <div 
                                                className="border-2 border-dashed border-slate-200 rounded-lg p-3 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors print:hidden"
                                                onClick={() => handleOpenUpload(step.id)}
                                              >
                                                  <ImageIcon size={16} className="text-slate-400 mb-1"/>
                                                  <span className="text-xs text-slate-500">Paste image or click to upload</span>
                                              </div>
                                          )}
                                      </div>
                                      {stepOutcome === 'CONDITIONAL' && (step.conditionalReason || conditionalReasonInputs[step.id]) && (
                                        <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                                          <span className="font-semibold">Conditional reason:</span>{' '}
                                          {(step.conditionalReason || conditionalReasonInputs[step.id])}
                                        </div>
                                      )}
                                  </div>
                              </div>
                              {isAdmin && editingStepId === step.id && (
                                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 print:hidden">
                                  <button
                                    onClick={() => setEditingStepId(null)}
                                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSaveStep(step.id)}
                                    className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                  >
                                    Save Changes
                                  </button>
                                </div>
                              )}

                              {/* Action Bar */}
                              {canRunTestActions && (
                                <div className="pt-2 border-t border-slate-50 print:hidden space-y-2">
                                    <div className="flex justify-end">
                                      <div className="mr-auto text-xs self-center">
                                      {stepSaveState[step.id] === 'saving' && <span className="text-slate-500 animate-status-pop">Saving step...</span>}
                                      {stepSaveState[step.id] === 'saved' && <span className="text-emerald-600 animate-status-pop">Step saved</span>}
                                      {stepSaveState[step.id] === 'error' && <span className="text-rose-600 animate-status-pop">Save failed</span>}
                                      </div>
                                      <div className="flex gap-2">
                                      <span className="text-[11px] self-center px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                                        {stepOutcome === 'PASSED' ? 'Current: PASS' : stepOutcome === 'FAILED' ? 'Current: FAIL' : stepOutcome === 'CONDITIONAL' ? 'Current: CONDITIONAL' : 'Current: Not set'}
                                      </span>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleStepUpdate(step.id, { stepResult: 'FAILED', isPassed: false, conditionalReason: null }); }}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2 ${stepOutcome === 'FAILED' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}
                                      >
                                        <XCircle size={14} /> FAIL
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleStepUpdate(step.id, { stepResult: 'CONDITIONAL', isPassed: null }); }}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2 ${stepOutcome === 'CONDITIONAL' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'}`}
                                      >
                                        <AlertCircle size={14} /> CONDITIONAL
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleStepUpdate(step.id, { stepResult: 'PASSED', isPassed: true, conditionalReason: null }); }}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2 ${stepOutcome === 'PASSED' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}
                                      >
                                        <CheckCircle size={14} /> PASS
                                      </button>
                                      </div>
                                    </div>
                                    {stepOutcome === 'CONDITIONAL' && (
                                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                                        <label className="text-[11px] font-semibold text-amber-800 block mb-1">
                                          Conditional reason (required)
                                        </label>
                                        <textarea
                                          className="w-full text-xs border-amber-200 rounded focus:ring-amber-400 focus:border-amber-400 min-h-[68px]"
                                          placeholder="Describe why this is conditionally passed..."
                                          value={conditionalReasonInputs[step.id] ?? step.conditionalReason ?? ''}
                                          onChange={(e) =>
                                            setConditionalReasonInputs((prev) => ({
                                              ...prev,
                                              [step.id]: e.target.value
                                            }))
                                          }
                                        />
                                        <div className="mt-2 flex justify-end">
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              const reason = (conditionalReasonInputs[step.id] ?? '').trim();
                                              if (!reason) {
                                                notify('Conditional reason is required', 'error');
                                                return;
                                              }
                                              handleStepUpdate(step.id, { stepResult: 'CONDITIONAL', isPassed: null, conditionalReason: reason });
                                            }}
                                            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700"
                                          >
                                            Save Reason
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                </div>
                              )}

                              {/* Comments */}
                              {(step.comments ?? []).length > 0 && (
                                 <div className="bg-slate-50 rounded-lg p-3 space-y-2 mt-2 print:bg-white print:border print:border-slate-200">
                                    {(step.comments ?? []).map(c => (
                                      <div
                                        key={c.id}
                                        ref={(el) => {
                                          commentElementRefs.current[c.id] = el;
                                        }}
                                        className={`flex gap-2 text-xs rounded px-2 py-1 transition-colors ${
                                          highlightedCommentId === c.id ? 'bg-amber-50 ring-1 ring-amber-200' : ''
                                        }`}
                                      >
                                         <span className="font-bold text-slate-800">{c.userId}</span>
                                         <span className="text-slate-600 whitespace-pre-wrap break-words">{renderCommentBody(c.text)}</span>
                                         <span className="text-slate-400 ml-auto">{formatDateTimeLocal(c.createdAt)}</span>
                                      </div>
                                    ))}
                                 </div>
                              )}
                              
                              {canRunTestActions && (
                                 <div className="mt-2 print:hidden space-y-2">
                                      <textarea
                                      className="w-full text-xs border-slate-200 rounded-lg px-3 py-2.5 focus:ring-brand-500 focus:border-brand-500 resize-y min-h-[74px]"
                                      placeholder="Add a comment... (use @Name to tag, Ctrl/Cmd + Enter to send)"
                                      value={commentDraft}
                                      onFocus={() => setActiveMentionStepId(step.id)}
                                      onBlur={() => {
                                        window.setTimeout(() => {
                                          setActiveMentionStepId((current) => (current === step.id ? null : current));
                                        }, 120);
                                      }}
                                      onChange={(e) => setCommentInputs((prev) => ({ ...prev, [step.id]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                                          e.preventDefault();
                                          void handleAddComment(step.id);
                                        }
                                      }}
                                    />
                                    {mentionSuggestions.length > 0 && (
                                      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                                        {mentionSuggestions.map((user) => (
                                          <button
                                            key={user.id}
                                            type="button"
                                            onMouseDown={(e) => {
                                              e.preventDefault();
                                              handleInsertMention(step.id, user.email || user.name);
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                                          >
                                            <p className="text-xs font-medium text-slate-800">{user.name}</p>
                                            <p className="text-[11px] text-slate-500">{user.email}</p>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] text-slate-500">
                                        {commentDraft.trim().length} characters
                                      </span>
                                      <div className="flex items-center gap-3">
                                        {commentSaveState[step.id] === 'saving' && <span className="text-[11px] text-slate-500 animate-status-pop">Posting comment...</span>}
                                        {commentSaveState[step.id] === 'saved' && <span className="text-[11px] text-emerald-600 animate-status-pop">Comment posted</span>}
                                        {commentSaveState[step.id] === 'error' && <span className="text-[11px] text-rose-600 animate-status-pop">Comment failed</span>}
                                        <button
                                          onClick={() => void handleAddComment(step.id)}
                                          disabled={commentSaveState[step.id] === 'saving' || !commentDraft.trim()}
                                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
                                          aria-label={`Send comment for Step ${idx + 1}`}
                                        >
                                          <Send size={12} />
                                          Send
                                        </button>
                                      </div>
                                    </div>
                                 </div>
                              )}
                          </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {isAdmin && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 print:hidden">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Task History</h3>
            {loadingHistory ? (
              <p className="text-sm text-slate-500">Loading history…</p>
            ) : historyItems.length === 0 ? (
              <p className="text-sm text-slate-500">No history entries yet.</p>
            ) : (
              <div className="space-y-3">
                {historyItems.slice(0, 12).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm text-slate-800">{entry.message}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {entry.actor?.name || entry.actor?.email || 'System'} • {formatDateTimeLocal(entry.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sign-off Section */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleUploadFile}
        />
        {/* Sign-off Section */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 flex flex-col items-center justify-center text-center print:border-0 print:bg-white">
           {isSignedOff ? (
             <div className="w-full flex flex-col items-center">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mb-3 print:hidden">
                   <Lock size={24} />
                </div>
                <h3 className="font-bold text-lg text-emerald-800">Testing Completed & Signed</h3>
                <p className="text-sm text-slate-600 mt-1 mb-4">
                  Signed by {signedByLabel} on {signedOnLabel}
                </p>
                {localTask.signedOff?.signatureData && (
                  <div className="border border-slate-200 rounded bg-white p-2">
                    <img src={localTask.signedOff.signatureData} alt="Signature" className="h-24 opacity-80" />
                  </div>
                )}
                
                {/* PDF Download Button */}
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3 print:hidden">
                  <button 
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 shadow-sm transition-colors"
                  >
                      <Printer size={16} /> Download PDF Report
                  </button>
                  <button
                    onClick={handleEmailReport}
                    disabled={emailingReport}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {emailingReport ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {emailingReport ? 'Emailing...' : 'Email Report to Me'}
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-500 print:hidden">
                  Emails include a secure printable report link for your signed-off task.
                </p>
             </div>
           ) : isDraft ? (
             <div className="w-full max-w-md print:hidden">
               <h3 className="font-semibold text-slate-900 mb-2">Sign-off Locked</h3>
               <p className="text-sm text-slate-600">
                 Admin must mark this task as READY before testing and sign-off can begin.
               </p>
             </div>
           ) : (
             <div className="w-full max-w-md print:hidden">
               <h3 className="font-semibold text-slate-900 mb-4">Sign-off & Complete</h3>
               
               {/* Drawing Pad */}
               <div className="mb-4 text-left">
                  <label className="text-xs font-medium text-slate-700 mb-1 block">Draw Signature</label>
                  <SignatureCanvas onEnd={setSignatureData} />
               </div>

               {/* Acknowledgement Checkbox */}
               <div className="flex items-start gap-2 mb-6 text-left bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <input 
                    type="checkbox" 
                    id="ack" 
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5 rounded text-brand-600 focus:ring-brand-500 border-gray-300"
                  />
                  <label htmlFor="ack" className="text-xs text-blue-900 leading-tight cursor-pointer select-none">
                     I acknowledge that by signing this task, I confirm all steps are executed correctly. This task will be locked and cannot be edited further.
                  </label>
               </div>

               <button 
                 onClick={handleSignOff}
                 disabled={signingOff || (localTask.steps ?? []).some((s) => !isStepResolved(s) || (getStepOutcome(s) === 'CONDITIONAL' && !(s.conditionalReason || '').trim())) || !signatureData || !acknowledged}
                 className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                   (signingOff || (localTask.steps ?? []).some((s) => !isStepResolved(s) || (getStepOutcome(s) === 'CONDITIONAL' && !(s.conditionalReason || '').trim())) || !signatureData || !acknowledged)
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                    : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md'
                 }`}
               >
                 {signingOff ? <Loader2 size={16} className="animate-spin" /> : <PenTool size={16} />}
                 {signingOff ? 'Completing task...' : 'Sign & Complete Task'}
               </button>
               
               {(localTask.steps ?? []).some((s) => !isStepResolved(s) || (getStepOutcome(s) === 'CONDITIONAL' && !(s.conditionalReason || '').trim())) && (
                 <p className="text-xs text-rose-500 mt-2">Please complete all test steps and fill conditional reasons before signing.</p>
               )}
             </div>
           )}
        </div>

      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        destructive={confirmDialog.destructive}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          const action = confirmDialog.onConfirm;
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          await action();
        }}
      />

      {/* Deployment Modal */}
      {deploymentModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 print:hidden">
           <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md animate-in zoom-in-95">
              <div className="flex items-center gap-3 mb-4 text-slate-900">
                 <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                    <Rocket size={20} className="text-slate-800"/>
                 </div>
                 <div>
                    <h3 className="font-bold text-lg">Deploy to Production</h3>
                    <p className="text-xs text-slate-500">Mark this feature as live</p>
                 </div>
              </div>
              
              <div className="space-y-4 mb-6">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Release Version</label>
                    <input 
                      type="text" 
                      className="w-full rounded-md border-slate-300 focus:ring-slate-500 focus:border-slate-500"
                      placeholder="e.g. v2.4.0"
                      value={releaseVersion}
                      onChange={(e) => setReleaseVersion(e.target.value)}
                    />
                 </div>
                 <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
                    <p className="text-xs text-yellow-800 flex items-start gap-2">
                       <AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>
                       This will notify all stakeholders that testing is complete and the feature is live.
                    </p>
                 </div>
              </div>

              <div className="flex justify-end gap-3">
                 <button 
                   onClick={() => setDeploymentModalOpen(false)}
                   className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium"
                 >
                   Cancel
                 </button>
                 <button 
                   onClick={handleDeploy}
                   className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-sm font-medium"
                 >
                   Confirm Deployment
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Image Modal */}
      {viewImage && (
        <div 
          className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4 cursor-zoom-out print:hidden"
          onClick={() => setViewImage(null)}
        >
            <img src={viewImage} alt="Full View" className="max-w-full max-h-full rounded-lg shadow-2xl" />
            <button className="absolute top-4 right-4 text-white hover:text-slate-300" aria-label="Close image preview">
                <X size={32} />
            </button>
        </div>
      )}

    </div>
  );
};
