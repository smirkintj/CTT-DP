import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { createAdminAudit } from '@/lib/adminAudit';
import { AiProvider, AiProviderConfig, loadAiConfig } from '@/lib/aiProvider';

const SETTING_KEY = 'ai.provider';

const DEFAULTS: AiProviderConfig = {
  provider: 'none',
  apiKey: '',
  model: ''
};

async function loadSettings(): Promise<AiProviderConfig> {
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Report what the runtime will actually use, including the env fallback —
  // otherwise Settings says "AI disabled" while drafting is really calling a model.
  const settings = await loadAiConfig();
  // Mask the key — return only whether it is set, not the value
  return NextResponse.json({
    ...settings,
    apiKey: settings.apiKey ? '••••••••' : '',
    apiKeySet: settings.apiKey.length > 0
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const current = await loadSettings();

  const validProviders: AiProvider[] = ['none', 'anthropic', 'deepseek'];
  const provider: AiProvider =
    typeof body.provider === 'string' && validProviders.includes(body.provider as AiProvider)
      ? (body.provider as AiProvider)
      : current.provider;

  // Only update apiKey if a real value was sent (not the masked placeholder)
  const apiKey =
    typeof body.apiKey === 'string' && body.apiKey !== '••••••••'
      ? body.apiKey
      : current.apiKey;

  const model = typeof body.model === 'string' ? body.model.trim() : current.model;

  const updated: AiProviderConfig = { provider, apiKey, model };

  await prisma.portalSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: updated as object, updatedById: session.user.id },
    update: { value: updated as object, updatedById: session.user.id }
  });

  await createAdminAudit({
    actorId: session.user.id,
    message: `${session.user.name || session.user.email || 'Admin'} updated AI provider settings (provider: ${provider}).`,
    metadata: { provider, model, apiKeySet: apiKey.length > 0 }
  });

  return NextResponse.json({
    provider,
    apiKey: apiKey ? '••••••••' : '',
    apiKeySet: apiKey.length > 0,
    model
  });
}
