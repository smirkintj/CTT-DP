import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import prisma from '../../../../lib/prisma';

const SETTING_KEY = 'email.reminders';

type EmailReminderSettings = {
  enabled: boolean;
  daysBefore: number;
};

const DEFAULTS: EmailReminderSettings = {
  enabled: false,
  daysBefore: 3
};

async function loadSettings(): Promise<EmailReminderSettings> {
  const row = await prisma.portalSetting.findUnique({
    where: { key: SETTING_KEY },
    select: { value: true }
  });
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return DEFAULTS;
  }
  const v = row.value as Record<string, unknown>;
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULTS.enabled,
    daysBefore: typeof v.daysBefore === 'number' && v.daysBefore > 0 ? v.daysBefore : DEFAULTS.daysBefore
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(await loadSettings());
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
  const updated: EmailReminderSettings = {
    enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
    daysBefore:
      typeof body.daysBefore === 'number' && body.daysBefore > 0 ? body.daysBefore : current.daysBefore
  };

  await prisma.portalSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: updated as object, updatedById: session.user.id },
    update: { value: updated as object, updatedById: session.user.id }
  });

  return NextResponse.json(updated);
}
