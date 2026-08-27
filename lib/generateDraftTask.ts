import type { SitTestRow } from './parseExcel';
import { callAiProvider, loadAiConfig } from './aiProvider';

export type GeneratedTaskData = {
  title: string;
  description: string;
  module: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  steps: Array<{ description: string; expectedResult: string }>;
  /** Which provider/model produced this, or 'fallback' when none ran. */
  generatedBy?: string;
};

/**
 * Convert SIT test rows into a structured UAT task using the provider selected
 * in admin Settings (env vars as fallback). Falls back to a mechanical draft
 * built from the raw rows when no provider is configured or the call fails —
 * `generatedBy` records which path ran so a fallback is not mistaken for AI output.
 */
export async function generateDraftTask(
  jiraTicket: string,
  jiraSummary: string,
  sitRows: SitTestRow[]
): Promise<GeneratedTaskData> {
  // Provider comes from the admin Settings page (falling back to env), so
  // switching provider there also switches this pipeline.
  const config = await loadAiConfig();

  if (config.provider === 'none' || !config.apiKey || sitRows.length === 0) {
    // Surfaced rather than silent: a draft built without a model looks the
    // same as an AI one, so the reason has to appear in the logs.
    console.warn(
      `[generateDraftTask] No AI provider configured${sitRows.length === 0 ? ' and no SIT rows' : ''} — using mechanical fallback for ${jiraTicket}.`
    );
    return { ...buildFallback(jiraSummary, sitRows), generatedBy: 'fallback' };
  }

  const rowsSummary = sitRows
    .slice(0, 30) // cap to avoid token bloat
    .map((r, i) => `${i + 1}. [${r.testCaseId}] ${r.title}\n   Steps: ${r.steps.map((s) => s.action).join(' | ')}\n   Expected: ${r.steps.map((s) => s.expected).join(' | ')}\n   SIT Result: ${r.result}`)
    .join('\n');

  const prompt = `You are a UAT task generator for a software testing tool called CTT.

A QA team has completed SIT (System Integration Testing) for Jira ticket ${jiraTicket}: "${jiraSummary}".

Below are the SIT test cases they executed:

${rowsSummary}

Generate a UAT (User Acceptance Testing) task for business stakeholders to validate in their environment.
UAT is performed by business users — not developers or QA. Write steps in plain business language.
Focus on what the user needs to verify works correctly from their perspective.

Return ONLY valid JSON with this exact structure:
{
  "title": "Short, clear UAT task title (max 120 chars)",
  "description": "2-3 sentence overview of what this UAT covers and why it matters to the business user",
  "module": "The feature area being tested (e.g. Bulk Order Upload, Account Management)",
  "priority": "HIGH" or "MEDIUM" or "LOW",
  "steps": [
    {
      "description": "What the user should do (action in plain language)",
      "expectedResult": "What the user should see or verify"
    }
  ]
}`;

  try {
    const content = await callAiProvider(
      'You are a UAT task generator for DKSH CTT. Return only valid JSON — no markdown, no commentary.',
      prompt
    );
    const match = content.trim().match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : content) as Partial<GeneratedTaskData>;

    return {
      title: String(parsed.title || jiraSummary).slice(0, 120),
      description: String(parsed.description || ''),
      module: String(parsed.module || 'General'),
      priority: (['HIGH', 'MEDIUM', 'LOW'] as const).includes(parsed.priority as never)
        ? (parsed.priority as 'HIGH' | 'MEDIUM' | 'LOW')
        : 'MEDIUM',
      steps: Array.isArray(parsed.steps)
        ? parsed.steps.map((s) => ({
            description: String(s.description || ''),
            expectedResult: String(s.expectedResult || ''),
          }))
        : buildFallback(jiraSummary, sitRows).steps,
      generatedBy: `${config.provider}:${config.model || 'default'}`,
    };
  } catch (err) {
    console.error(
      `[generateDraftTask] ${config.provider} call failed for ${jiraTicket}, using fallback:`,
      err
    );
    return { ...buildFallback(jiraSummary, sitRows), generatedBy: 'fallback' };
  }
}

function buildFallback(jiraSummary: string, sitRows: SitTestRow[]): GeneratedTaskData {
  return {
    title: `UAT: ${jiraSummary}`.slice(0, 120),
    description: `UAT validation derived from SIT results. Please verify the following scenarios work correctly in the UAT environment.`,
    module: 'General',
    priority: 'MEDIUM',
    steps: sitRows.slice(0, 20).map((r) => ({
      description: r.title || r.steps[0]?.action || 'Perform test case',
      expectedResult: r.steps[0]?.expected || 'Verify expected behaviour',
    })),
  };
}
