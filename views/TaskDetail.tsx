'use client';

import React, { useState, useEffect } from 'react';
import { Task, Status, User, Role, TestStep, Priority } from '../types';
import { Badge } from '../components/Badge';
import { SignatureCanvas } from '../components/SignatureCanvas';
import { ArrowLeft, Send, CheckCircle, XCircle, AlertCircle, ChevronDown, ChevronUp, Database, Image as ImageIcon, Link as LinkIcon, User as UserIcon, Rocket, Globe, Calendar, Lock, PenTool, Monitor, FileText, ExternalLink, X, Printer } from 'lucide-react';

console.log("TaskDetail rendered");

interface TaskDetailProps {
  task: Task;
  currentUser: User;
  onBack: () => void;
  onUpdateTask: (task: Task) => void;
}

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

const formatDateTime = (value?: string) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const TaskDetail: React.FC<TaskDetailProps> = ({ task, currentUser, onBack, onUpdateTask }) => {
  const [localTask, setLocalTask] = useState<Task>(() => normalizeTask(task));
  const [expandedStep, setExpandedStep] = useState<string | null>(() => {
    const safe = normalizeTask(task);
    return safe.steps.find(s => s.isPassed === null)?.id || safe.steps[0]?.id || null;
  });
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [taskEdits, setTaskEdits] = useState({
    jiraTicket: task.jiraTicket ?? '',
    developer: task.developer ?? '',
    dueDate: toDateInputValue(task.dueDate),
    priority: task.priority ?? Priority.MEDIUM,
    featureModule: task.featureModule ?? ''
  });
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [stepEdits, setStepEdits] = useState<{ [key: string]: Partial<TestStep> }>({});
  const [deploymentModalOpen, setDeploymentModalOpen] = useState(false);
  const [releaseVersion, setReleaseVersion] = useState('');
  const [commentInputs, setCommentInputs] = useState<{[key: string]: string}>({});
  const [viewImage, setViewImage] = useState<string | null>(null);
  
  // Signature State
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  
  const isAdmin = currentUser.role === Role.ADMIN;
  const isDeployed = localTask.status === Status.DEPLOYED;
  const isSignedOff = !!localTask.signedOff || !!localTask.signedOffAt;

  // Portal URL Logic
  const portalUrl = localTask.targetSystem === 'Admin Portal' 
    ? 'https://www.easyorderadminstg.dksh.com' 
    : 'https://www.easyorderstg.dksh.com';

  // Handle Step Updates
  const persistStepProgress = async (stepId: string, updates: Partial<TestStep>) => {
    await fetch(`/api/tasks/${localTask.id}/steps/${stepId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isPassed: updates.isPassed,
        actualResult: updates.actualResult,
        attachments: updates.attachments
      })
    });
  };

  const handleStepUpdate = (stepId: string, updates: Partial<TestStep>) => {
    if (isSignedOff) return; // Prevent edits if signed

    const updatedSteps = (localTask.steps ?? []).map(step => {
      if (step.id === stepId) {
        return { 
          ...step, 
          ...updates, 
          completedAt: updates.isPassed !== null ? new Date().toLocaleString() : undefined 
        };
      }
      return step;
    });

    const previousStatus = localTask.status;
    const updatedTask = { ...localTask, steps: updatedSteps };
    
    // Auto-update task status if all passed
    const allPassed = updatedSteps.every(s => s.isPassed === true);
    if (allPassed && localTask.status !== Status.DEPLOYED && localTask.status !== Status.PASSED) {
      updatedTask.status = Status.PASSED;
    } else if (updatedSteps.some(s => s.isPassed === false)) {
      updatedTask.status = Status.FAILED;
    } else if (updatedSteps.some(s => s.isPassed === true) && localTask.status === Status.PENDING) {
      updatedTask.status = Status.IN_PROGRESS;
    }

    setLocalTask(updatedTask);
    onUpdateTask(updatedTask);

    if (updatedTask.status !== previousStatus) {
      void persistStatus(updatedTask.status);
    }
    if (!isAdmin) {
      void persistStepProgress(stepId, updates);
    }

    // Auto-advance logic
    if (updates.isPassed === true) {
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
    if (isSignedOff) return;
    const currentStep = (localTask.steps ?? []).find(s => s.id === stepId);
    if (!currentStep || !currentStep.attachments) return;
    
    const newAttachments = [...currentStep.attachments];
    newAttachments.splice(index, 1);
    handleStepUpdate(stepId, { attachments: newAttachments });
  };

  const handleAddComment = async (stepId: string) => {
    const text = commentInputs[stepId];
    if (!text || !text.trim()) return;
    const response = await fetch(`/api/tasks/${localTask.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text })
    });

    if (!response.ok) return;

    await refreshTask(localTask.id);
    setCommentInputs({ ...commentInputs, [stepId]: '' });
  };

  // Paste handler for screenshots
  const handlePaste = (e: React.ClipboardEvent, stepId: string) => {
    if (isSignedOff) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result as string;
                const currentStep = (localTask.steps ?? []).find(s => s.id === stepId);
                if (currentStep) {
                    const currentAttachments = currentStep.attachments || [];
                    handleStepUpdate(stepId, { attachments: [...currentAttachments, base64] });
                }
            };
            if (blob) reader.readAsDataURL(blob);
            e.preventDefault(); // Prevent pasting into text inputs if focused
        }
    }
  };

  const handleSignOff = () => {
    if (!signatureData || !acknowledged) return;

    const updatedTask: Task = {
      ...localTask,
      status: Status.PASSED,
      signedOff: {
        signedBy: currentUser.name,
        signedAt: new Date().toLocaleString(),
        signatureData: signatureData
      }
    };
    setLocalTask(updatedTask);
    onUpdateTask(updatedTask);
    void persistStatus(updatedTask.status);
    void fetch(`/api/tasks/${localTask.id}/signoff`, { method: 'POST' });
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

  const handlePrint = () => {
      window.print();
  };

  const refreshTask = async (taskId: string) => {
    const response = await fetch(`/api/tasks/${taskId}`, { cache: 'no-store' });
    if (!response.ok) return;
    const updated = await response.json();
    const safeUpdated = normalizeTask(updated as Task);
    setLocalTask(safeUpdated);
    onUpdateTask(safeUpdated);
  };

  const persistStatus = async (status: Status) => {
    await fetch(`/api/tasks/${localTask.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
  };

  const handleSaveTaskMeta = async () => {
    const response = await fetch(`/api/tasks/${localTask.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jiraTicket: taskEdits.jiraTicket,
        developer: taskEdits.developer,
        dueDate: fromDateInputValue(taskEdits.dueDate),
        priority: taskEdits.priority,
        module: taskEdits.featureModule
      })
    });

    if (!response.ok) return;
    const updated = await response.json();
    const safeUpdated = normalizeTask(updated as Task);
    setLocalTask(safeUpdated);
    onUpdateTask(safeUpdated);
    setIsEditingTask(false);
  };

  const handleAddStep = async () => {
    const response = await fetch(`/api/tasks/${localTask.id}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'New step',
        expectedResult: 'Expected outcome',
        testData: ''
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
        testData: edits?.testData
      })
    });

    if (!response.ok) return;
    setEditingStepId(null);
    await refreshTask(localTask.id);
  };

  const handleDeleteStep = async (stepId: string) => {
    const confirmed = window.confirm('Delete this step?');
    if (!confirmed) return;
    const response = await fetch(`/api/tasks/${localTask.id}/steps/${stepId}`, {
      method: 'DELETE'
    });
    if (!response.ok) return;
    await refreshTask(localTask.id);
  };

  useEffect(() => {
    const safe = normalizeTask(task);
    setLocalTask(safe);
    setTaskEdits({
      jiraTicket: safe.jiraTicket ?? '',
      developer: safe.developer ?? '',
      dueDate: toDateInputValue(safe.dueDate),
      priority: safe.priority ?? Priority.MEDIUM,
      featureModule: safe.featureModule ?? ''
    });
    void refreshTask(safe.id);
  }, [task.id]);

  return (
    <div className="max-w-5xl mx-auto animate-fade-in pb-20 print:p-0 print:max-w-none">
      
      {/* Header Nav */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <button 
          onClick={onBack} 
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft size={18} /> Back
        </button>
        {isAdmin && !isDeployed && localTask.status === Status.PASSED && (
          <button 
            onClick={() => setDeploymentModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Rocket size={16} /> Deploy Feature
          </button>
        )}
      </div>

      <div className="space-y-6">
          
        {/* Task Header Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative overflow-hidden print:border-0 print:shadow-none">
          {isDeployed && (
            <div className="absolute top-0 right-0 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-bl-lg z-10 print:hidden">
              DEPLOYED {localTask.deployment?.deployedAt}
            </div>
          )}
          
          <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex flex-wrap gap-2">
                <Badge type="module" value={localTask.featureModule} />
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
                 <h1 className="text-2xl font-bold text-slate-900 mb-2">{localTask.title}</h1>
                 <p className="text-slate-600">{localTask.description}</p>
            </div>
            {/* Launch UAT Button - Hidden in Print */}
            <a 
                href={portalUrl} 
                target="_blank" 
                rel="noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 bg-brand-600 text-white rounded-lg shadow-sm hover:bg-brand-700 transition-colors font-medium text-sm print:hidden"
            >
                <Monitor size={18} /> Launch {localTask.targetSystem}
                <ExternalLink size={14} className="opacity-70" />
            </a>
          </div>

          {/* Meta Data Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              <div>
                <span className="text-xs text-slate-400 block mb-1">Jira Ticket</span>
                <a href="#" className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
                  <LinkIcon size={12}/> {localTask.jiraTicket || 'N/A'}
                </a>
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Developer</span>
                <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
                  <UserIcon size={12}/> {localTask.developer || 'Unassigned'}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Due Date</span>
                <span className="flex items-center gap-1 text-sm font-medium text-slate-700">
                  <Calendar size={12}/> {formatDateTime(localTask.dueDate)}
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-400 block mb-1">Priority</span>
                <Badge type="priority" value={localTask.priority} />
              </div>
          </div>

          {isAdmin && (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Edit task details</h3>
                {!isEditingTask ? (
                  <button
                    onClick={() => setIsEditingTask(true)}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditingTask(false)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveTaskMeta}
                      className="text-xs font-medium text-white bg-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-800"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>

              {isEditingTask && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Jira Ticket</label>
                    <input
                      className="w-full rounded-md border-slate-300 text-sm focus:ring-brand-500 focus:border-brand-500"
                      value={taskEdits.jiraTicket}
                      onChange={(e) => setTaskEdits({ ...taskEdits, jiraTicket: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Developer</label>
                    <input
                      className="w-full rounded-md border-slate-300 text-sm focus:ring-brand-500 focus:border-brand-500"
                      value={taskEdits.developer}
                      onChange={(e) => setTaskEdits({ ...taskEdits, developer: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Due Date</label>
                    <input
                      type="date"
                      className="w-full rounded-md border-slate-300 text-sm focus:ring-brand-500 focus:border-brand-500"
                      value={taskEdits.dueDate}
                      onChange={(e) => setTaskEdits({ ...taskEdits, dueDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Priority</label>
                    <select
                      className="w-full rounded-md border-slate-300 text-sm focus:ring-brand-500 focus:border-brand-500"
                      value={taskEdits.priority}
                      onChange={(e) => setTaskEdits({ ...taskEdits, priority: e.target.value as Priority })}
                    >
                      <option value={Priority.HIGH}>High</option>
                      <option value={Priority.MEDIUM}>Medium</option>
                      <option value={Priority.LOW}>Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Module</label>
                    <input
                      className="w-full rounded-md border-slate-300 text-sm focus:ring-brand-500 focus:border-brand-500"
                      value={taskEdits.featureModule}
                      onChange={(e) => setTaskEdits({ ...taskEdits, featureModule: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Test Execution Accordion */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:border-0 print:shadow-none">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center print:bg-white print:border-b-2 print:border-slate-800">
            <h3 className="font-semibold text-slate-900 flex items-center gap-2">
              <CheckCircle size={18} className="text-slate-400"/> Test Steps
            </h3>
            <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
              {(localTask.steps ?? []).filter(s => s.isPassed === true).length} / {(localTask.steps ?? []).length} Steps Completed
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
                const statusColor = step.isPassed === true ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 
                                  step.isPassed === false ? 'bg-rose-100 border-rose-200 text-rose-700' : 
                                  'bg-white border-slate-200 text-slate-500';
                
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
                    >
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold flex-shrink-0 ${statusColor}`}>
                          {step.isPassed === true ? <CheckCircle size={16}/> : step.isPassed === false ? <XCircle size={16}/> : idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                              <p className={`text-sm font-medium ${step.isPassed === true ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                {step.description}
                              </p>
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
                                 className="text-[10px] font-medium text-slate-500 hover:text-slate-800"
                               >
                                 Edit
                               </button>
                               <button
                                 onClick={(e) => { e.stopPropagation(); handleDeleteStep(step.id); }}
                                 className="text-[10px] font-medium text-rose-600 hover:text-rose-700"
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
                              {isAdmin && editingStepId === step.id && (
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                                  <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Description</label>
                                    <textarea
                                      className="w-full rounded-md border-slate-300 text-sm focus:ring-brand-500 focus:border-brand-500"
                                      value={stepEdits[step.id]?.description ?? ''}
                                      onChange={(e) =>
                                        setStepEdits((prev) => ({
                                          ...prev,
                                          [step.id]: { ...prev[step.id], description: e.target.value }
                                        }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Expected Result</label>
                                    <textarea
                                      className="w-full rounded-md border-slate-300 text-sm focus:ring-brand-500 focus:border-brand-500"
                                      value={stepEdits[step.id]?.expectedResult ?? ''}
                                      onChange={(e) =>
                                        setStepEdits((prev) => ({
                                          ...prev,
                                          [step.id]: { ...prev[step.id], expectedResult: e.target.value }
                                        }))
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-medium text-slate-500 mb-1 block">Test Data</label>
                                    <input
                                      className="w-full rounded-md border-slate-300 text-sm focus:ring-brand-500 focus:border-brand-500"
                                      value={stepEdits[step.id]?.testData ?? ''}
                                      onChange={(e) =>
                                        setStepEdits((prev) => ({
                                          ...prev,
                                          [step.id]: { ...prev[step.id], testData: e.target.value }
                                        }))
                                      }
                                    />
                                  </div>
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => setEditingStepId(null)}
                                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleSaveStep(step.id)}
                                      className="text-xs font-medium text-white bg-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-800"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                              )}
                              
                              {/* Expected vs Actual Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Left Col: Requirements */}
                                  <div className="space-y-4">
                                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 print:bg-white print:border-slate-300">
                                          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 block">Expected Result</span>
                                          <p className="text-sm text-slate-700">{step.expectedResult}</p>
                                      </div>
                                      
                                      {step.testData && (
                                          <div>
                                              <span className="text-[10px] uppercase font-bold text-brand-600 tracking-wider mb-1 block flex items-center gap-1">
                                                  <Database size={10}/> Test Data
                                              </span>
                                              <code className="text-xs bg-slate-50 px-2 py-1.5 rounded border border-slate-200 text-slate-700 block font-mono">
                                                  {step.testData}
                                              </code>
                                          </div>
                                      )}
                                  </div>

                                  {/* Right Col: Evidence & Actual */}
                                  <div className="space-y-3">
                                      {!isSignedOff ? (
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
                                              {!isSignedOff && <span className="font-normal text-[10px] normal-case text-slate-400">Ctrl+V to paste</span>}
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
                                                          {!isSignedOff && (
                                                            <button 
                                                              onClick={(e) => { e.stopPropagation(); deleteAttachment(step.id, i); }}
                                                              className="absolute top-0 right-0 bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                              <X size={12} />
                                                            </button>
                                                          )}
                                                      </div>
                                                  ))}
                                              </div>
                                          )}

                                          {!isSignedOff && (
                                              <div 
                                                className="border-2 border-dashed border-slate-200 rounded-lg p-3 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors print:hidden"
                                                onClick={() => {/* Trigger file input logic would go here */}}
                                              >
                                                  <ImageIcon size={16} className="text-slate-400 mb-1"/>
                                                  <span className="text-xs text-slate-500">Paste image or click to upload</span>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              </div>

                              {/* Action Bar */}
                              {!isSignedOff && (
                                <div className="flex justify-end pt-2 border-t border-slate-50 print:hidden">
                                    <div className="flex gap-2">
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleStepUpdate(step.id, { isPassed: false }); }}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2 ${step.isPassed === false ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'}`}
                                      >
                                        <XCircle size={14} /> FAIL
                                      </button>
                                      <button 
                                        onClick={(e) => { e.stopPropagation(); handleStepUpdate(step.id, { isPassed: true }); }}
                                        className={`px-4 py-2 rounded-lg text-xs font-bold border transition-colors flex items-center gap-2 ${step.isPassed === true ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}
                                      >
                                        <CheckCircle size={14} /> PASS
                                      </button>
                                    </div>
                                </div>
                              )}

                              {/* Comments */}
                              {(step.comments ?? []).length > 0 && (
                                 <div className="bg-slate-50 rounded-lg p-3 space-y-2 mt-2 print:bg-white print:border print:border-slate-200">
                                    {(step.comments ?? []).map(c => (
                                      <div key={c.id} className="flex gap-2 text-xs">
                                         <span className="font-bold text-slate-800">{c.userId}</span>
                                         <span className="text-slate-600">{c.text}</span>
                                         <span className="text-slate-400 ml-auto">{c.createdAt}</span>
                                      </div>
                                    ))}
                                 </div>
                              )}
                              
                              {!isSignedOff && (
                                 <div className="flex gap-2 mt-2 print:hidden">
                                    <input 
                                      type="text" 
                                      className="flex-1 text-xs border-slate-200 rounded px-3 py-2 focus:ring-brand-500 focus:border-brand-500"
                                      placeholder="Add a comment..."
                                      value={commentInputs[step.id] || ''}
                                      onChange={(e) => setCommentInputs({...commentInputs, [step.id]: e.target.value})}
                                      onKeyDown={(e) => e.key === 'Enter' && handleAddComment(step.id)}
                                    />
                                    <button onClick={() => handleAddComment(step.id)} className="text-slate-400 hover:text-brand-600 p-2">
                                      <Send size={14} />
                                    </button>
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

        {/* Sign-off Section */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 flex flex-col items-center justify-center text-center print:border-0 print:bg-white">
           {isSignedOff ? (
             <div className="w-full flex flex-col items-center">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mb-3 print:hidden">
                   <Lock size={24} />
                </div>
                <h3 className="font-bold text-lg text-emerald-800">Testing Completed & Signed</h3>
                <p className="text-sm text-slate-500 mt-1 mb-4">Signed by {localTask.signedOff?.signedBy} on {localTask.signedOff?.signedAt}</p>
                {localTask.signedOff?.signatureData && (
                  <div className="border border-slate-200 rounded bg-white p-2">
                    <img src={localTask.signedOff.signatureData} alt="Signature" className="h-24 opacity-80" />
                  </div>
                )}
                
                {/* PDF Download Button */}
                <button 
                  onClick={handlePrint}
                  className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 shadow-sm transition-colors print:hidden"
                >
                    <Printer size={16} /> Download PDF Report
                </button>
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
                 disabled={(localTask.steps ?? []).some(s => s.isPassed === null) || !signatureData || !acknowledged}
                 className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                   ((localTask.steps ?? []).some(s => s.isPassed === null) || !signatureData || !acknowledged)
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                    : 'bg-slate-900 text-white hover:bg-slate-800 shadow-md'
                 }`}
               >
                 <PenTool size={16} /> Sign & Complete Task
               </button>
               
               {(localTask.steps ?? []).some(s => s.isPassed === null) && (
                 <p className="text-xs text-rose-500 mt-2">Please complete all test steps before signing.</p>
               )}
             </div>
           )}
        </div>

      </div>

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
            <button className="absolute top-4 right-4 text-white hover:text-slate-300">
                <X size={32} />
            </button>
        </div>
      )}

    </div>
  );
};
