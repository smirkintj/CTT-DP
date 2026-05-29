import OpenAI from 'openai';
import type { SitTestRow } from './parseExcel';

export type GeneratedTaskData = {
  title: string;
  description: string;
  module: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  steps: Array<{ description: string; expectedResult: string }>;
};

/**
 * Use DeepSeek V4 Pro to convert SIT test rows into a structured UAT task.
 * Falls back to a basic structure derived from the raw rows if the AI call fails.
 */
export async function generateDraftTask(
  jiraTicket: string,
  jiraSummary: string,
  sitRows: SitTestRow[]
): Promise<GeneratedTaskData> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey || sitRows.length === 0) {
    return buildFallback(jiraSummary, sitRows);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  });

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
    const response = await client.chat.completions.create({
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content ?? '';
    const parsed = JSON.parse(content) as Partial<GeneratedTaskData>;

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
    };
  } catch (err) {
    console.error('[generateDraftTask] DeepSeek call failed, using fallback:', err);
    return buildFallback(jiraSummary, sitRows);
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
