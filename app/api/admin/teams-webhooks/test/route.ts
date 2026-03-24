import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { badRequest, forbidden, unauthorized } from '@/lib/apiError';
import { createAdminAudit } from '@/lib/adminAudit';
import { sendTeamsTestMessage } from '@/lib/teams';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  if (session.user.role !== 'ADMIN') {
    return forbidden('Forbidden', 'ADMIN_REQUIRED');
  }

  const body = await req.json().catch(() => null);
  const productId = body?.productId?.toString().trim();
  const countryCode = body?.countryCode?.toString().trim().toUpperCase();

  if (!productId) return badRequest('productId is required', 'PRODUCT_ID_REQUIRED');
  if (!countryCode) return badRequest('countryCode is required', 'COUNTRY_CODE_REQUIRED');

  const result = await sendTeamsTestMessage({
    productId,
    countryCode,
    initiatedBy: session.user.name || session.user.email || 'Admin'
  });

  if (!result.ok) {
    await createAdminAudit({
      actorId: session.user.id,
      countryCode,
      message: `Teams test notification failed for ${countryCode}.`,
      metadata: { action: 'TEAMS_TEST_FAILED', productId, reason: result.reason || 'UNKNOWN' }
    });

    if (result.reason === 'CONFIG_NOT_FOUND') {
      return NextResponse.json({ error: 'No Teams configuration found for this product/country.' }, { status: 404 });
    }
    if (result.reason === 'WEBHOOK_MISSING') {
      return NextResponse.json({ error: 'Teams webhook URL is missing.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to deliver Teams test message.' }, { status: 500 });
  }

  await createAdminAudit({
    actorId: session.user.id,
    countryCode,
    message: `Teams test notification sent for ${countryCode}.`,
    metadata: { action: 'TEAMS_TEST_SENT', productId }
  });

  return NextResponse.json({ success: true });
}
