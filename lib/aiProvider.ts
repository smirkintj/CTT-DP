import prisma from './prisma';

const SETTING_KEY = 'ai.provider';

export type AiProvider = 'anthropic' | 'deepseek' | 'none';

export type AiProviderConfig = {
  provider: AiProvider;
  apiKey: string;
  model: string;
};

const DEFAULTS: AiProviderConfig = {
  provider: 'none',
  apiKey: '',
  model: ''
};

/**
 * Environment fallback so deployments configured before the Settings page
 * existed keep working. The database setting always wins once an admin saves
 * one; this only fills in when none is configured.
 */
function envConfig(): AiProviderConfig {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || ''
    };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || ''
    };
  }
  return DEFAULTS;
}

export async function loadAiConfig(): Promise<AiProviderConfig> {
  let row: { value: unknown } | null = null;
  try {
    row = await prisma.portalSetting.findUnique({
      where: { key: SETTING_KEY },
      select: { value: true }
    });
  } catch {
    // No database reachable (scripts, local tooling) — fall back to env.
    return envConfig();
  }

  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return envConfig();
  }
  const v = row.value as Record<string, unknown>;
  const config: AiProviderConfig = {
    provider: v.provider === 'anthropic' || v.provider === 'deepseek' ? v.provider : 'none',
    apiKey: typeof v.apiKey === 'string' ? v.apiKey : '',
    model: typeof v.model === 'string' ? v.model : ''
  };
  // A row exists but was never completed — env is still better than nothing.
  if (config.provider === 'none' || !config.apiKey) return envConfig();
  return config;
}

export async function callAiProvider(systemPrompt: string, userMessage: string): Promise<string> {
  const config = await loadAiConfig();

  if (config.provider === 'none' || !config.apiKey) {
    throw new Error('No AI provider configured');
  }

  if (config.provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: config.model || 'claude-haiku-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      }),
      cache: 'no-store'
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type: string; text: string }>;
    };
    return payload.content?.find((c) => c.type === 'text')?.text ?? '';
  }

  if (config.provider === 'deepseek') {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model || 'deepseek-v4-pro',
        temperature: 0.2,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      }),
      cache: 'no-store'
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`DeepSeek API error (${response.status}): ${text.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return payload.choices?.[0]?.message?.content ?? '';
  }

  throw new Error('Unknown AI provider');
}
