'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { JiraIssueGroup, JiraTaskPrefill, User } from '../types';
import { apiFetch, ApiError } from '../lib/http';

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
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
};

const priorityClassMap: Record<string, string> = {
  highest: 'bg-rose-500/15 text-rose-200 border border-rose-400/20',
  high: 'bg-amber-500/15 text-amber-200 border border-amber-400/20',
  medium: 'bg-sky-500/15 text-sky-200 border border-sky-400/20',
  low: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20',
  lowest: 'bg-slate-500/15 text-slate-200 border border-slate-400/20',
};
const getPriorityClass = (priority?: string | null) =>
  priority ? (priorityClassMap[priority.toLowerCase()] ?? 'bg-white/5 text-slate-300 border border-white/10') : 'bg-white/5 text-slate-300 border border-white/10';

const taskStatusClassMap: Record<string, string> = {
  Draft: 'bg-slate-500/15 text-slate-300 border border-slate-400/20',
  Ready: 'bg-sky-500/15 text-sky-200 border border-sky-400/20',
  Pending: 'bg-amber-500/15 text-amber-200 border border-amber-400/20',
  'In Progress': 'bg-indigo-500/15 text-indigo-200 border border-indigo-400/20',
  Passed: 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20',
  Failed: 'bg-rose-500/15 text-rose-200 border border-rose-400/20',
  Blocked: 'bg-orange-500/15 text-orange-200 border border-orange-400/20',
  Deployed: 'bg-teal-500/15 text-teal-200 border border-teal-400/20',
};
const getTaskStatusClass = (status: string) =>
  taskStatusClassMap[status] ?? 'bg-white/5 text-slate-300 border border-white/10';

// Per-card orbit colours cycling through 4 accents
const CARD_ACCENTS = [
  { border: 'rgba(99,102,241,0.3)', glow: 'rgba(99,102,241,0.15)', ring: 'rgba(99,102,241,0.12)', id: 'text-indigo-300' },
  { border: 'rgba(139,92,246,0.3)', glow: 'rgba(139,92,246,0.15)', ring: 'rgba(139,92,246,0.1)', id: 'text-violet-300' },
  { border: 'rgba(236,72,153,0.25)', glow: 'rgba(236,72,153,0.12)', ring: 'rgba(236,72,153,0.08)', id: 'text-pink-300' },
  { border: 'rgba(20,184,166,0.25)', glow: 'rgba(20,184,166,0.12)', ring: 'rgba(20,184,166,0.08)', id: 'text-teal-300' },
];

// Inject keyframes once
const STYLE_ID = 'jira-intake-styles';
const CSS = `
  @keyframes ji-twinkle { 0%,100%{opacity:0} 50%{opacity:var(--star-o,0.7)} }
  @keyframes ji-drift-a { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(24px,16px) scale(1.08)} }
  @keyframes ji-drift-b { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(-18px,22px) scale(1.06)} }
  @keyframes ji-drift-c { 0%{transform:translate(0,0) scale(1)} 100%{transform:translate(14px,-18px) scale(1.1)} }
  @keyframes ji-drift-d { 0%{transform:translate(0,0) scale(1) rotate(0deg)} 100%{transform:translate(-22px,10px) scale(1.05) rotate(8deg)} }
  @keyframes ji-spin-cw  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes ji-spin-ccw { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
  @keyframes ji-shoot { 0%{left:-10%;top:20%;opacity:0;transform:scaleX(0.3)} 8%{opacity:0.9;transform:scaleX(1)} 92%{opacity:0.9} 100%{left:115%;top:75%;opacity:0} }
  @keyframes ji-comet { 0%{left:-5%;top:10%;opacity:0} 5%{opacity:0.6} 95%{opacity:0.6} 100%{left:105%;top:60%;opacity:0} }
  @keyframes ji-fadein { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes ji-pulse-ring { 0%,100%{transform:scale(1);opacity:0.4} 50%{transform:scale(1.12);opacity:0.8} }
  @keyframes ji-hero-glow { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.06)} }
  @keyframes ji-float { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-6px)} }
  @keyframes ji-particle { 0%{transform:translate(0,0) scale(1);opacity:0.8} 50%{opacity:1} 100%{transform:translate(var(--px,10px),var(--py,-20px)) scale(0);opacity:0} }
`;

function injectStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

// Star canvas
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
    resize();
    const stars = Array.from({ length: 240 }, () => ({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.8 + 0.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 1.1,
      peak: 0.25 + Math.random() * 0.75,
    }));
    // Shooting comets on canvas
    const comets = Array.from({ length: 3 }, () => ({
      x: Math.random(), y: Math.random() * 0.5,
      vx: 0.0012 + Math.random() * 0.001,
      vy: 0.0004 + Math.random() * 0.0003,
      len: 60 + Math.random() * 80,
      alpha: 0,
      life: 0, maxLife: 180 + Math.random() * 120,
      restart: () => { /* handled below */ }
    }));
    let raf: number;
    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Stars
      for (const s of stars) {
        const o = s.peak * (0.5 + 0.5 * Math.sin(t * 0.001 * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${o})`;
        ctx.fill();
      }
      // Comets
      for (const c of comets) {
        c.life++;
        if (c.life > c.maxLife) { c.x = Math.random() * 0.3; c.y = Math.random() * 0.4; c.life = 0; c.maxLife = 180 + Math.random() * 120; }
        const fade = c.life < 20 ? c.life / 20 : c.life > c.maxLife - 20 ? (c.maxLife - c.life) / 20 : 1;
        c.alpha = fade * 0.55;
        const cx = (c.x + c.vx * c.life) * canvas.width;
        const cy = (c.y + c.vy * c.life) * canvas.height;
        const tailX = cx - c.vx * c.life * canvas.width * Math.min(1, c.life / 40);
        const tailY = cy - c.vy * c.life * canvas.height * Math.min(1, c.life / 40);
        const grd = ctx.createLinearGradient(tailX, tailY, cx, cy);
        grd.addColorStop(0, `rgba(200,210,255,0)`);
        grd.addColorStop(1, `rgba(220,225,255,${c.alpha})`);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(cx, cy);
        ctx.strokeStyle = grd;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Comet head glow
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240,245,255,${c.alpha * 1.4})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

// Individual card with orbit rings + shooting star
function IssueCard({
  issue,
  accentIdx,
  animDelay,
  onOpenTask,
  onCreateTask,
}: {
  issue: JiraIssueGroup['issues'][number];
  accentIdx: number;
  animDelay: number;
  onOpenTask: (id: string) => void;
  onCreateTask: (issue: JiraIssueGroup['issues'][number]) => void;
}) {
  const acc = CARD_ACCENTS[accentIdx % CARD_ACCENTS.length];
  return (
    <article
      className="relative flex flex-col overflow-hidden rounded-[20px] p-[1px] transition-transform duration-200 hover:-translate-y-1"
      style={{
        flex: '1 1 240px',
        minHeight: 220,
        background: `linear-gradient(135deg, ${acc.border}, rgba(255,255,255,0.04))`,
        animation: `ji-fadein 0.45s ease both`,
        animationDelay: `${animDelay}ms`,
      }}
    >
      {/* Inner card */}
      <div className="relative flex h-full flex-col rounded-[19px] overflow-hidden bg-[#080e1e] p-4">
        {/* Orbit rings */}
        <div className="pointer-events-none absolute" style={{ top: -50, right: -50, width: 160, height: 160, borderRadius: '50%', border: `1px solid ${acc.ring}`, animation: `ji-spin-cw ${18 + accentIdx * 4}s linear infinite` }} />
        <div className="pointer-events-none absolute" style={{ top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', border: `1px solid ${acc.ring}`, opacity: 0.7, animation: `ji-spin-ccw ${13 + accentIdx * 3}s linear infinite` }} />
        <div className="pointer-events-none absolute" style={{ top: -70, right: -70, width: 220, height: 220, borderRadius: '50%', border: `1px dashed ${acc.ring}`, opacity: 0.35, animation: `ji-pulse-ring ${5 + accentIdx}s ease-in-out infinite` }} />
        {/* Glow blob */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full" style={{ background: `radial-gradient(circle, ${acc.glow}, transparent 70%)`, animation: `ji-drift-${['a','b','c','a'][accentIdx % 3]} ${12 + accentIdx * 2}s ease-in-out infinite alternate` }} />
        {/* Shooting star */}
        <div className="pointer-events-none absolute h-px w-14 overflow-hidden" style={{ top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', height: 1, width: 56, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)`, animation: `ji-shoot ${7 + accentIdx * 1.5}s linear infinite`, animationDelay: `${accentIdx * 1.2}s` }} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex h-full flex-col">
          {/* Header row: key + linked badge */}
          <div className="flex items-center justify-between gap-2">
            <div className={`text-[11px] font-black tracking-[0.2em] ${acc.id}`}>{issue.key}</div>
            {issue.linkedTasks.length > 0 && (
              <span className="rounded-full border border-amber-300/25 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                {issue.linkedTasks.length} linked
              </span>
            )}
          </div>
          <h4 className="mt-2 text-sm font-semibold leading-snug text-slate-100">{issue.summary}</h4>

          {/* Jira status + priority pills */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">{issue.status}</span>
            {issue.priority && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getPriorityClass(issue.priority)}`}>{issue.priority}</span>
            )}
          </div>

          {/* Jira meta */}
          <div className="mt-3 space-y-1 text-xs text-slate-400">
            <p>Updated: {formatDate(issue.updatedAt)}</p>
            <p>Assignee: {issue.assigneeName || 'Unassigned'}</p>
          </div>

          {/* Linked CTT tasks — replaces CTA when linked */}
          {issue.linkedTasks.length > 0 ? (
            <div className="mt-4 flex flex-col gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">CTT Tasks</p>
              {issue.linkedTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenTask(t.id)}
                  className="group flex w-full items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3 py-2 text-left transition hover:border-white/20 hover:bg-white/8"
                >
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-200 group-hover:text-white">{t.title}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${getTaskStatusClass(t.status)}`}>{t.status}</span>
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{t.countryCode}</span>
                  <ExternalLink size={10} className="shrink-0 text-slate-600 group-hover:text-slate-400" />
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-auto pt-4">
              <button
                type="button"
                onClick={() => onCreateTask(issue)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-slate-100"
              >
                Create Task <Plus size={11} />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

const ORB_CLASSES = [
  'from-indigo-400 to-indigo-700 shadow-[0_0_24px_rgba(99,102,241,0.5)]',
  'from-fuchsia-400 to-violet-700 shadow-[0_0_24px_rgba(168,85,247,0.45)]',
  'from-rose-400 to-pink-700 shadow-[0_0_24px_rgba(244,63,94,0.4)]',
  'from-teal-400 to-cyan-700 shadow-[0_0_24px_rgba(20,184,166,0.4)]',
];

export const AdminJiraIntake: React.FC<AdminJiraIntakeProps> = ({ currentUser, onOpenTask, onCreateTask }) => {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [groups, setGroups] = useState<JiraIssueGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { injectStyles(); }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setPageError(null);
      try {
        const data = await apiFetch<JiraIntakeResponse>('/api/admin/jira-intake');
        setConfigured(data.configured);
        setGroups(Array.isArray(data.groups) ? data.groups : []);
        if (!data.configured && data.error) setPageError(data.error);
      } catch (error) {
        setPageError(error instanceof ApiError ? error.message : 'Failed to load Jira intake');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filteredGroups = useMemo(() => {
    // Hide groups for products with no Jira credentials configured
    const configured = groups.filter((g) => !('error' in g && g.error === 'Jira credentials not configured for this product'));
    const q = searchTerm.trim().toLowerCase();
    if (!q) return configured;
    return configured
      .map((g) => ({ ...g, issues: g.issues.filter((i) => i.key.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q)) }))
      .filter((g) => g.issues.length > 0 || ('error' in g && g.error && g.error !== 'Jira credentials not configured for this product'));
  }, [groups, searchTerm]);

  const totalIssueCount = filteredGroups.reduce((s, g) => s + g.issues.length, 0);
  const scopeLabel = currentUser.productAccesses?.length
    ? currentUser.productAccesses.map((p) => p.name).join(' · ')
    : 'All products';

  const handleCreateFromIssue = (issue: JiraIssueGroup['issues'][number]) => {
    onCreateTask({ jiraTicket: issue.key, title: issue.summary, description: `Imported from Jira ${issue.key}`, productId: issue.productId, productName: issue.productName });
  };

  // Track global card index for accent cycling
  let globalCardIdx = 0;

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-slate-800/80 bg-[#060b18] text-white shadow-[0_30px_80px_rgba(2,6,23,0.4)]">
      {/* Animated star field */}
      <StarField />

      {/* Nebula blobs */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-28 right-0 h-96 w-96 rounded-full bg-indigo-500/14 blur-[90px]" style={{ animation: 'ji-drift-a 18s ease-in-out infinite alternate' }} />
        <div className="absolute -bottom-16 left-0 h-72 w-72 rounded-full bg-fuchsia-500/12 blur-[80px]" style={{ animation: 'ji-drift-b 22s ease-in-out infinite alternate' }} />
        <div className="absolute left-1/3 top-1/3 h-64 w-64 rounded-full bg-rose-500/10 blur-[80px]" style={{ animation: 'ji-drift-c 16s ease-in-out infinite alternate' }} />
        <div className="absolute bottom-1/4 right-1/4 h-56 w-56 rounded-full bg-teal-500/10 blur-[70px]" style={{ animation: 'ji-drift-a 20s ease-in-out 4s infinite alternate' }} />
        <div className="absolute top-1/2 left-1/4 h-48 w-48 rounded-full bg-violet-500/10 blur-[70px]" style={{ animation: 'ji-drift-d 25s ease-in-out 2s infinite alternate' }} />
        <div className="absolute top-0 left-1/2 h-40 w-40 rounded-full bg-cyan-500/8 blur-[60px]" style={{ animation: 'ji-drift-b 14s ease-in-out 1s infinite alternate' }} />
        {/* Hero glow behind header */}
        <div className="absolute -top-10 left-8 h-52 w-52 rounded-full bg-indigo-400/8 blur-[60px]" style={{ animation: 'ji-hero-glow 6s ease-in-out infinite' }} />
      </div>

      <div className="relative z-10 space-y-8 p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Admin · JIRA Queue</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white" style={{ animation: 'ji-float 5s ease-in-out infinite' }}>Ready for Testing</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">Jira items waiting to become CTT tasks — scoped to your assigned products.</p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]" style={{ animation: 'ji-twinkle 2s ease-in-out infinite', ['--star-o' as string]: '1' }} />
              {scopeLabel}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search tickets"
                className="w-56 rounded-2xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none"
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300">
              {totalIssueCount} item{totalIssueCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {pageError && (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
              <div>
                <p className="font-medium">Jira intake unavailable</p>
                <p className="mt-1 text-amber-100/70">{pageError}</p>
                {!configured && <p className="mt-2 text-xs text-amber-100/50">Set <code>JIRA_BASE_URL</code>, <code>JIRA_API_EMAIL</code>, <code>JIRA_API_TOKEN</code> in Vercel env vars.</p>}
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[24px] border border-white/8 bg-white/4">
            <div className="flex items-center gap-3 text-slate-300">
              <Loader2 size={18} className="animate-spin" />
              Loading from Jira…
            </div>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="rounded-[24px] border border-white/8 bg-white/4 p-10 text-center">
            <Sparkles size={22} className="mx-auto mb-3 text-indigo-300" />
            <p className="text-base font-medium text-white">No items found</p>
            <p className="mt-2 text-sm text-slate-400">No products configured or no matching Jira statuses returned results.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {filteredGroups.map((group, gi) => {
              const orbClass = ORB_CLASSES[gi % ORB_CLASSES.length];
              return (
                <section key={group.productId} className="space-y-4">
                  {/* Product header */}
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-black tracking-widest text-white ${orbClass}`}>
                      {(group.projectKey || group.productName.slice(0, 2)).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-white">{group.productName}</h2>
                        {group.projectKey && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{group.projectKey}</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">{group.statuses.join(', ')}</p>
                    </div>
                    <span className="ml-auto text-xs text-slate-500">{group.issues.length} item{group.issues.length !== 1 ? 's' : ''}</span>
                  </div>

                  {group.error ? (
                    <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">Failed to load: {group.error}</div>
                  ) : group.issues.length === 0 ? (
                    <div className="rounded-2xl border border-white/8 bg-white/4 p-5 text-sm text-slate-400">No items returned for this product.</div>
                  ) : (
                    <div className="flex flex-wrap gap-4">
                      {group.issues.map((issue) => {
                        const idx = globalCardIdx++;
                        return (
                          <IssueCard
                            key={issue.key}
                            issue={issue}
                            accentIdx={idx}
                            animDelay={idx * 60}
                            onOpenTask={onOpenTask}
                            onCreateTask={handleCreateFromIssue}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
