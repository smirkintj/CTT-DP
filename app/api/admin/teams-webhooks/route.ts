import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { badRequest, forbidden, notFound, unauthorized } from '../../../../lib/apiError';
import { createAdminAudit } from '../../../../lib/adminAudit';
import { encryptField, decryptField } from '../../../../lib/encrypt';

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { error: unauthorized('Unauthorized', 'AUTH_REQUIRED') };
  if (session.user.role !== 'ADMIN') return { error: forbidden('Forbidden', 'ADMIN_REQUIRED') };
  return { session };
}

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (!productId) return badRequest('productId is required', 'PRODUCT_ID_REQUIRED');

  const configs = await prisma.notificationConfig.findMany({
    where: { productId },
    orderBy: { countryCode: 'asc' }
  });

  return NextResponse.json(configs.map(c => ({ ...c, teamsWebhookUrl: decryptField(c.teamsWebhookUrl) })));
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const productId = body?.productId?.toString().trim();
  const countryCode = body?.countryCode?.toString().trim().toUpperCase();

  if (!productId) return badRequest('productId is required', 'PRODUCT_ID_REQUIRED');
  if (!countryCode) return badRequest('countryCode is required', 'COUNTRY_CODE_REQUIRED');

  const [product, country] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId } }),
    prisma.country.findUnique({ where: { code: countryCode } })
  ]);
  if (!product) return notFound('Product not found', 'PRODUCT_NOT_FOUND');
  if (!country) return notFound('Country not found', 'COUNTRY_NOT_FOUND');

  const config = await prisma.notificationConfig.upsert({
    where: { productId_countryCode: { productId, countryCode } },
    update: {
      teamsWebhookUrl: encryptField(body?.teamsWebhookUrl?.toString().trim() || null),
      isActive: Boolean(body?.isActive),
      notifyTaskAssigned: body?.notifyTaskAssigned !== false,
      notifyReminder: body?.notifyReminder !== false,
      notifySignedOff: body?.notifySignedOff !== false,
      notifyFailedStep: body?.notifyFailedStep !== false
    },
    create: {
      productId,
      countryCode,
      teamsWebhookUrl: encryptField(body?.teamsWebhookUrl?.toString().trim() || null),
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
    message: `${auth.session.user.name || auth.session.user.email || 'Admin'} updated Teams webhook for ${product.name} / ${countryCode}.`,
    metadata: { productId, isActive: config.isActive }
  });

  return NextResponse.json(config);
}
