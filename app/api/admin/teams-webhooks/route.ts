import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return null;
}

export async function GET() {
  const authError = await requireAdmin();
  if (authError) return authError;

  const configs = await prisma.notificationConfig.findMany({
    include: {
      country: {
        select: { code: true, name: true }
      }
    },
    orderBy: { countryCode: 'asc' }
  });

  return NextResponse.json(configs);
}

export async function POST(req: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const body = await req.json().catch(() => null);
  const countryCode = body?.countryCode?.toString().trim().toUpperCase();
  if (!countryCode) {
    return NextResponse.json({ error: 'countryCode is required' }, { status: 400 });
  }

  const country = await prisma.country.findUnique({ where: { code: countryCode } });
  if (!country) {
    return NextResponse.json({ error: 'Country not found' }, { status: 404 });
  }

  const config = await prisma.notificationConfig.upsert({
    where: { countryCode },
    update: {
      teamsWebhookUrl: body?.teamsWebhookUrl?.toString().trim() || null,
      isActive: Boolean(body?.isActive),
      notifyTaskAssigned: body?.notifyTaskAssigned !== false,
      notifyReminder: body?.notifyReminder !== false,
      notifySignedOff: body?.notifySignedOff !== false,
      notifyFailedStep: body?.notifyFailedStep !== false
    },
    create: {
      countryCode,
      teamsWebhookUrl: body?.teamsWebhookUrl?.toString().trim() || null,
      isActive: Boolean(body?.isActive),
      notifyTaskAssigned: body?.notifyTaskAssigned !== false,
      notifyReminder: body?.notifyReminder !== false,
      notifySignedOff: body?.notifySignedOff !== false,
      notifyFailedStep: body?.notifyFailedStep !== false
    }
  });

  return NextResponse.json(config);
}
