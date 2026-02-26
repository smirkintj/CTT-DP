import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/apiError';
import { createAdminAudit } from '@/lib/adminAudit';
import { canRunAdminAction } from '@/lib/adminRateLimit';
import { sendTemporaryPasswordEmail } from '@/lib/email';

function generateTemporaryPassword() {
  const base = randomBytes(8).toString('base64url');
  return `Tmp!${base.slice(0, 8)}9`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const { id: userId } = await params;
  if (!userId) return badRequest('User id is required', 'USER_ID_REQUIRED');
  if (!canRunAdminAction(`password-reset:${session.user.id}:${userId}`, 60_000)) {
    return badRequest('Please wait 1 minute before resetting this password again', 'RATE_LIMITED');
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });
    if (!targetUser) return notFound('User not found', 'USER_NOT_FOUND');

    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: true }
    });

    const emailSent = await sendTemporaryPasswordEmail({
      to: targetUser.email,
      recipientName: targetUser.name,
      temporaryPassword
    });

    await createAdminAudit({
      actorId: session.user.id,
      message: `Admin reset password for ${targetUser.email}.`,
      countryCode: targetUser.countryCode,
      metadata: { action: 'USER_PASSWORD_RESET', userId: targetUser.id, emailSent }
    });

    return NextResponse.json({
      success: true,
      emailSent
    });
  } catch (error) {
    return internalError('Failed to reset password', 'USER_RESET_PASSWORD_FAILED', String(error));
  }
}
