import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { forbidden, unauthorized } from '../../../../lib/apiError';
import { getAdminProductScope } from '../../../../lib/adminAccess';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  }

  if (session.user.role !== 'ADMIN') {
    return forbidden('Forbidden', 'ADMIN_REQUIRED');
  }
  const scope = await getAdminProductScope(session.user.id);

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');
  if (scope.restricted && productId && !scope.productIds.includes(productId)) {
    return forbidden('Forbidden', 'ADMIN_PRODUCT_FORBIDDEN');
  }
  const users = await prisma.user.findMany({
    where: {
      role: 'STAKEHOLDER',
      isActive: true,
      countryCode: { not: null },
      ...((productId || scope.restricted)
        ? {
            productAccesses: {
              some: {
                ...(productId ? { productId } : { productId: { in: scope.productIds } })
              }
            }
          }
        : {})
    },
    select: {
      id: true,
      name: true,
      email: true,
      countryCode: true,
      productAccesses: {
        include: {
          product: true
        }
      }
    },
    orderBy: [{ countryCode: 'asc' }, { name: 'asc' }],
    take: 500
  });

  return NextResponse.json(users);
}
