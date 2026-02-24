import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
