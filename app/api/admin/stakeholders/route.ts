import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { forbidden, unauthorized } from '../../../../lib/apiError';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  if (session.user.role !== 'ADMIN') {
    return forbidden('Forbidden', 'ADMIN_REQUIRED');
  }

  const users = await prisma.user.findMany({
    where: {
      role: 'STAKEHOLDER',
      countryCode: { not: null }
    },
    select: {
      id: true,
      name: true,
      email: true,
      countryCode: true
    },
    orderBy: [{ countryCode: 'asc' }, { name: 'asc' }]
  });

  return NextResponse.json(users);
}
