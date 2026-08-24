import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { callAiProvider, loadAiConfig } from '@/lib/aiProvider';

export type AiImportAssistResult = {
  columnMap: {
    description: string;
    expectedResult: string;
    actualResult: string;
    testData: string;
  };
  summary: string;
  insights: string[];
};

const SYSTEM_PROMPT = `You are an expert UAT test analyst for DKSH's Change Tracking Tool (CTT).
CTT is used to track UAT and SIT testing across products and markets before production deployments.
Products include EasyOrder (EO), SalesHub (SH), and ServicePro (SP).

Your job: analyse a spreadsheet of test cases and return a JSON object. Return ONLY valid JSON — no markdown, no explanation.`;

function buildUserPrompt(input: {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
  productName?: string;
  countryCode?: string;
  taskTitle?: string;
}): string {
  const context = [
    input.productName && `Product: ${input.productName}`,
    input.countryCode && `Market: ${input.countryCode}`,
    input.taskTitle && `Task: ${input.taskTitle}`
  ]
    .filter(Boolean)
    .join(' | ');

  const sampleText = input.sampleRows
    .slice(0, 8)
    .map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`)
    .join('\n');

  return `${context ? `Context: ${context}\n\n` : ''}Headers: ${JSON.stringify(input.headers)}\n\nSample rows (first ${Math.min(8, input.sampleRows.length)} of ${input.totalRows} total):\n${sampleText}\n\nTASK 1 — Column Mapping:\nMap each CTT field to the best matching column. Use an empty string if not found.\nFields:\n- description: the test step action / what the tester should do\n- expectedResult: what should happen if the step passes\n- actualResult: the observed result (often blank at import time)\n- testData: input data, credentials, or test values used in the step\n\nTASK 2 — Quality Insights:\nReview the sample rows and provide:\n- A 2–3 sentence overall assessment of the test case quality and readiness for UAT/SIT\n- 3–6 concise insights: strengths, gaps, risks, or suggestions for the admin reviewer\n\nReturn ONLY this JSON shape:\n{\n  "columnMap": {\n    "description": "",\n    "expectedResult": "",\n    "actualResult": "",\n    "testData": ""\n  },\n  "summary": "",\n  "insights": []\n}`;
}

function extractJson(raw: string): AiImportAssistResult | null {
  const trimmed = raw.trim();
  // Try direct parse first
  try {
    return JSON.parse(trimmed) as AiImportAssistResult;
  } catch {
    // Try to extract JSON block
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as AiImportAssistResult;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const config = await loadAiConfig();
  if (config.provider === 'none' || !config.apiKey) {
    return NextResponse.json({ error: 'No AI provider configured' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.headers) || !Array.isArray(body.sampleRows)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const prompt = buildUserPrompt({
    headers: body.headers as string[],
    sampleRows: body.sampleRows as Record<string, string>[],
    totalRows: typeof body.totalRows === 'number' ? body.totalRows : body.sampleRows.length,
    productName: typeof body.productName === 'string' ? body.productName : undefined,
    countryCode: typeof body.countryCode === 'string' ? body.countryCode : undefined,
    taskTitle: typeof body.taskTitle === 'string' ? body.taskTitle : undefined
  });

  const raw = await callAiProvider(SYSTEM_PROMPT, prompt);
  const result = extractJson(raw);

  if (!result) {
    return NextResponse.json({ error: 'AI returned unparseable response' }, { status: 502 });
  }

  // Validate column names against the actual headers
  const validHeaders = new Set(body.headers as string[]);
  const safeMap = {
    description: validHeaders.has(result.columnMap?.description) ? result.columnMap.description : '',
    expectedResult: validHeaders.has(result.columnMap?.expectedResult) ? result.columnMap.expectedResult : '',
    actualResult: validHeaders.has(result.columnMap?.actualResult) ? result.columnMap.actualResult : '',
    testData: validHeaders.has(result.columnMap?.testData) ? result.columnMap.testData : ''
  };

  return NextResponse.json({
    columnMap: safeMap,
    summary: typeof result.summary === 'string' ? result.summary : '',
    insights: Array.isArray(result.insights) ? result.insights.filter((i) => typeof i === 'string') : []
  } satisfies AiImportAssistResult);
}
