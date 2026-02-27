import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getAuthSession } from '../../../../lib/auth';
import { badRequest, internalError, unauthorized } from '../../../../lib/apiError';

const selectFields = {
  notifyOnAssignmentEmail: true,
  notifyOnReminderEmail: true,
  notifyOnMentionInbox: true,
  notifyOnSignoffEmail: true
} as const;

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: selectFields
    });

    if (!user) {
      return unauthorized('Unauthorized', 'AUTH_USER_NOT_FOUND');
    }

    return NextResponse.json(user);
  } catch (error) {
    return internalError('Failed to load notification preferences', 'NOTIFY_PREF_FETCH_FAILED', String(error));
  }
}

export async function PATCH(req: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return badRequest('Invalid payload', 'NOTIFY_PREF_PAYLOAD_INVALID');
  }

  const allowedKeys = [
    'notifyOnAssignmentEmail',
    'notifyOnReminderEmail',
    'notifyOnMentionInbox',
    'notifyOnSignoffEmail'
  ] as const;

  const data: Partial<Record<(typeof allowedKeys)[number], boolean>> = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      if (typeof body[key] !== 'boolean') {
        return badRequest(`Invalid value for ${key}`, 'NOTIFY_PREF_VALUE_INVALID');
      }
      data[key] = body[key];
    }
  }

  if (Object.keys(data).length === 0) {
    return badRequest('No preferences provided', 'NOTIFY_PREF_EMPTY');
  }

  try {
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data,
      select: selectFields
    });
    return NextResponse.json(updated);
  } catch (error) {
    return internalError('Failed to save notification preferences', 'NOTIFY_PREF_UPDATE_FAILED', String(error));
  }
}
