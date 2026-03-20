import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { forbidden, unauthorized } from '@/lib/apiError';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      modules: {
        where: { isActive: true },
        orderBy: { name: 'asc' }
      },
      targetSystems: {
        where: { isActive: true },
        orderBy: { name: 'asc' }
      }
    },
    orderBy: { name: 'asc' }
  });

  return NextResponse.json(products);
}
