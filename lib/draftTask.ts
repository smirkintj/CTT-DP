/**
 * Turn a group of SIT test cases into a UAT task draft.
 *
 * One generator for both entry points — the Jira intake cron and the import
 * wizard. They previously had separate prompts, separate JSON handling and
 * separate fallbacks, so the same workbook produced different drafts depending
 * on how it arrived.
 */
import { callAiProvider, loadAiConfig } from './aiProvider';
import { toDraftTask, type StoryGroup, type TaskPriorityValue } from './sitWorkbook';

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
      if (c.actions.length) {
        parts.push(`Actions:\n${c.actions.map((a, n) => `  ${n + 1}. ${a}`).join('\n')}`);
      }
      if (c.expected.length) {
        parts.push(`Expected:\n${c.expected.map((e) => `  - ${e}`).join('\n')}`);
      }
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
export function structuredDraft(group: StoryGroup, fallbackReason?: string): DraftedTask {
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

/**
 * Draft one task from one story. Never throws: any failure returns the
 * structured draft with `fallbackReason` set, so a caller always has something
 * usable and can tell an AI draft from a mechanical one.
 */
export async function draftTaskFromStory(
  group: StoryGroup,
  options: { productName?: string } = {}
): Promise<DraftedTask> {
  const config = await loadAiConfig();
  if (config.provider === 'none' || !config.apiKey) {
    return structuredDraft(group, 'no provider configured');
  }

  const label = `${config.provider}:${config.model || 'default'}`;

  try {
    const raw = await callAiProvider(SYSTEM_PROMPT, buildPrompt(group, options.productName), 8192);
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
    console.error(`[draftTask] ${group.key} failed:`, error);
    // Surface the provider's own message — a wrong model id or a rejected key
    // is otherwise indistinguishable from "no AI configured".
    return structuredDraft(group, message.slice(0, 300));
  }
}
