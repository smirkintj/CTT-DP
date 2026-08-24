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

export async function loadAiConfig(): Promise<AiProviderConfig> {
  const row = await prisma.portalSetting.findUnique({
    where: { key: SETTING_KEY },
    select: { value: true }
  });
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return DEFAULTS;
  }
  const v = row.value as Record<string, unknown>;
  return {
    provider: v.provider === 'anthropic' || v.provider === 'deepseek' ? v.provider : 'none',
    apiKey: typeof v.apiKey === 'string' ? v.apiKey : '',
    model: typeof v.model === 'string' ? v.model : ''
  };
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
        model: config.model || 'claude-haiku-4-5-20251001',
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
        model: config.model || 'deepseek-chat',
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
