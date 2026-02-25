import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { badRequest, forbidden, notFound, unauthorized } from '../../../../lib/apiError';
import { createAdminAudit } from '../../../../lib/adminAudit';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: unauthorized('Unauthorized', 'AUTH_REQUIRED') };
  if (session.user.role !== 'ADMIN') return { error: forbidden('Forbidden', 'ADMIN_REQUIRED') };
  return { session };
}

export async function GET() {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

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
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const countryCode = body?.countryCode?.toString().trim().toUpperCase();
  if (!countryCode) {
    return badRequest('countryCode is required', 'COUNTRY_CODE_REQUIRED');
  }

  const country = await prisma.country.findUnique({ where: { code: countryCode } });
  if (!country) {
    return notFound('Country not found', 'COUNTRY_NOT_FOUND');
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

  await createAdminAudit({
    actorId: auth.session.user.id,
    countryCode,
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} updated Teams notification settings for ${countryCode}.`,
    metadata: {
      isActive: config.isActive,
      notifyTaskAssigned: config.notifyTaskAssigned,
      notifyReminder: config.notifyReminder,
      notifySignedOff: config.notifySignedOff,
      notifyFailedStep: config.notifyFailedStep
    }
  });

  return NextResponse.json(config);
}
