import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { badRequest, internalError, unauthorized } from '@/lib/apiError';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return unauthorized('Unauthorized', 'AUTH_REQUIRED');

  const body = await req.json().catch(() => null);
  const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
  const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!currentPassword || !newPassword || !confirmPassword) {
    return badRequest('All password fields are required', 'PASSWORD_FIELDS_REQUIRED');
  }

  if (!PASSWORD_REGEX.test(newPassword)) {
    return badRequest(
      'Password must be at least 8 chars with uppercase, lowercase, number, and symbol',
      'PASSWORD_WEAK'
    );
  }
  if (newPassword !== confirmPassword) {
    return badRequest('New password and confirm password do not match', 'PASSWORD_MISMATCH');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });
    if (!user) return unauthorized('Unauthorized', 'AUTH_USER_NOT_FOUND');

    const isCurrentValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      return badRequest('Current password is incorrect', 'PASSWORD_CURRENT_INVALID');
    }
    if (currentPassword === newPassword) {
      return badRequest('New password must be different from current password', 'PASSWORD_NO_CHANGE');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: false
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return internalError('Failed to change password', 'PASSWORD_CHANGE_FAILED', String(error));
  }
}
