import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { badRequest } from '@/lib/apiError';
import { canRequestMagicLink } from '@/lib/magicLinkRateLimit';
import {
  buildMagicLoginUrl,
  createMagicTokenValue,
  getMagicTokenExpiryDate,
  getMagicTokenExpiresInMinutes,
  hashMagicToken
} from '@/lib/magicLogin';
import { sendAdminMagicLoginEmail } from '@/lib/email';
import { UserRole } from '@prisma/client';

type RequestBody = {
  email?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as RequestBody | null;
  const email = body?.email?.toLowerCase().trim() ?? '';
  const isEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isEmailFormat) {
    return badRequest('Please enter a valid email address.', 'EMAIL_INVALID');
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limitKey = `magic-link:${email}:${ip}`;
  if (!canRequestMagicLink(limitKey)) {
    return NextResponse.json(
      { success: true, message: 'If the account is eligible, a sign-in link will be emailed.' },
      { status: 200 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, isActive: true }
    });

    if (user && user.role === UserRole.ADMIN && user.isActive) {
      const rawToken = createMagicTokenValue();
      const hashed = hashMagicToken(rawToken);
      const expiresAt = getMagicTokenExpiryDate();
      const created = await prisma.magicLoginToken.create({
        data: {
          userId: user.id,
          tokenHash: hashed,
          expiresAt
        },
        select: { id: true }
      });
      const combinedToken = `${created.id}.${rawToken}`;
      const loginUrl = buildMagicLoginUrl(combinedToken);

      if (loginUrl) {
        await sendAdminMagicLoginEmail({
          to: user.email,
          recipientName: user.name,
          loginUrl,
          expiresInMinutes: getMagicTokenExpiresInMinutes()
        });
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Magic link request failed:', error);
    }
  }

  return NextResponse.json(
    { success: true, message: 'If the account is eligible, a sign-in link will be emailed.' },
    { status: 200 }
  );
}
