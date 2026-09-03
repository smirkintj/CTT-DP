import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callAiProvider, loadAiConfig } from '@/lib/aiProvider';
import type { StoryGroup, TaskPriorityValue } from '@/lib/sitWorkbook';
import { toDraftTask } from '@/lib/sitWorkbook';

export type DraftedTask = {
  storyKey: string;
  jiraTicket: string | null;
  title: string;
  description: string;
  module: string | null;
  priority: TaskPriorityValue;
  countries: string[];
  steps: Array<{ description: string; expectedResult: string }>;
  /** 'anthropic:model' / 'deepseek:model', or 'structured' when no model ran. */
  generatedBy: string;
  /** Why the structured fallback was used, when it was. */
  fallbackReason?: string;
};

const SYSTEM_PROMPT = `You are a UAT test analyst for DKSH's Change Tracking Tool (CTT).
CTT tracks UAT testing across products and markets before production deployment.

You convert a QA team's completed SIT test cases into a UAT task an admin can
review and approve in one pass. Rewrite for a UAT tester who was not involved
in SIT: keep every verifiable check, drop SIT bookkeeping.

Return ONLY valid JSON. No markdown fences, no commentary.`;

function buildPrompt(group: StoryGroup, productName?: string): string {
  const cases = group.cases
    .map((c, i) => {
      const parts = [`CASE ${i + 1}: ${c.name}`];
      if (c.description) parts.push(`Objective: ${c.description}`);
      if (c.preconditions) parts.push(`Preconditions: ${c.preconditions}`);
      if (c.actions.length) parts.push(`Actions:\n${c.actions.map((a, n) => `  ${n + 1}. ${a}`).join('\n')}`);
      if (c.expected.length) parts.push(`Expected:\n${c.expected.map((e) => `  - ${e}`).join('\n')}`);
      return parts.join('\n');
    })
    .join('\n\n');

  return `${productName ? `Product: ${productName}\n` : ''}Jira story: ${group.key}
Feature/module: ${group.module || group.title}
${group.countries.length ? `Markets tested in SIT: ${group.countries.join(', ')}\n` : ''}
${group.cases.length} SIT test case(s):

${cases}

Produce one UAT task covering these cases.

Rules:
- title: what a tester would recognise this feature as. No "UAT:" prefix, no Jira key, max 100 chars.
- description: 1-2 sentences on what is being verified and why it matters.
- module: the feature area, a short noun phrase.
- priority: HIGH, MEDIUM or LOW, judged on user impact.
- steps: one per test case, in the given order. Do not merge or drop cases.
  - description: the action to perform, as numbered instructions a tester can
    follow without seeing the SIT sheet. Keep the concrete detail (screens,
    fields, values). Do not include preconditions as a numbered step — fold
    them into a leading "Precondition:" line when they matter.
  - expectedResult: the checks, one per line, each starting with "- ".
- Never invent steps or checks that are not in the source.
- Never carry over SIT verdicts, evidence links, tester names or environments.

Return exactly this JSON shape:
{
  "title": "",
  "description": "",
  "module": "",
  "priority": "MEDIUM",
  "steps": [{ "description": "", "expectedResult": "" }]
}`;
}

function extractJson(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

/** Deterministic draft — the floor when no model runs or its reply is unusable. */
function structuredDraft(group: StoryGroup, fallbackReason?: string): DraftedTask {
  const base = toDraftTask(group);
  return {
    storyKey: group.key,
    jiraTicket: base.jiraTicket,
    title: base.title,
    description: base.description,
    module: base.module,
    priority: base.priority,
    countries: base.detectedCountries,
    steps: base.steps.map((s) => ({
      description: s.description,
      expectedResult: s.expectedResult
    })),
    generatedBy: 'structured',
    fallbackReason
  };
}

const PRIORITIES: TaskPriorityValue[] = ['HIGH', 'MEDIUM', 'LOW'];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.stories) ? (body.stories as unknown[]) : null;
  if (!raw || raw.length === 0) {
    return NextResponse.json({ error: 'No stories supplied' }, { status: 400 });
  }
  // Validate before use: toDraftTask and buildPrompt both dereference cases,
  // so a malformed payload would throw a 500 instead of reporting a bad request.
  const groups = raw.filter(
    (g): g is StoryGroup =>
      Boolean(g) &&
      typeof (g as StoryGroup).key === 'string' &&
      Array.isArray((g as StoryGroup).cases) &&
      Array.isArray((g as StoryGroup).countries)
  );
  if (groups.length !== raw.length) {
    return NextResponse.json({ error: 'Malformed story payload' }, { status: 400 });
  }
  if (groups.length > 25) {
    return NextResponse.json({ error: 'Too many stories in one request' }, { status: 400 });
  }

  const productName = typeof body.productName === 'string' ? body.productName : undefined;
  const config = await loadAiConfig();
  const aiAvailable = config.provider !== 'none' && Boolean(config.apiKey);
  const label = `${config.provider}:${config.model || 'default'}`;

  // Each story is drafted independently so one bad reply cannot spoil the rest.
  const tasks = await Promise.all(
    groups.map(async (group): Promise<DraftedTask> => {
      if (!aiAvailable) return structuredDraft(group, 'no provider configured');

      try {
        const raw = await callAiProvider(SYSTEM_PROMPT, buildPrompt(group, productName), 8192);
        const parsed = extractJson(raw);
        if (!parsed) {
          // Usually a truncated reply — the JSON never closed.
          return structuredDraft(
            group,
            `could not parse the model reply (${raw.trim().length} chars returned)`
          );
        }

        const steps = Array.isArray(parsed.steps)
          ? (parsed.steps as Array<Record<string, unknown>>)
              .map((s) => ({
                description: String(s?.description ?? '').trim(),
                expectedResult: String(s?.expectedResult ?? '').trim()
              }))
              .filter((s) => s.description || s.expectedResult)
          : [];

        // A reply that lost test cases is worse than the structured draft —
        // silently dropping a case is the failure mode that matters here.
        if (steps.length < group.cases.length) {
          return structuredDraft(
            group,
            `model returned ${steps.length} steps for ${group.cases.length} test cases`
          );
        }

        const priority = String(parsed.priority ?? '').toUpperCase() as TaskPriorityValue;

        return {
          storyKey: group.key,
          jiraTicket: group.story || null,
          title: String(parsed.title ?? '').trim().slice(0, 100) || group.title,
          description: String(parsed.description ?? '').trim() || group.title,
          module: String(parsed.module ?? '').trim() || group.module || null,
          priority: PRIORITIES.includes(priority) ? priority : group.priority,
          countries: group.countries,
          steps,
          generatedBy: label
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[import/draft-tasks] ${group.key} failed:`, error);
        // Surface the provider's own message — a wrong model id or a rejected
        // key is otherwise indistinguishable from "no AI configured".
        return structuredDraft(group, message.slice(0, 300));
      }
    })
  );

  const failures = tasks.filter((t) => t.generatedBy === 'structured' && t.fallbackReason);

  return NextResponse.json({
    tasks,
    aiAvailable,
    provider: aiAvailable ? label : 'none',
    // One representative reason so the UI can say what actually went wrong.
    fallbackReason: failures[0]?.fallbackReason ?? null,
    fallbackCount: failures.length
  });
}
