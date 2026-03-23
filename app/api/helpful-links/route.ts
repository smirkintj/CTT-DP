import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/prisma';
import { getHelpfulLinksKey } from '../../../lib/helpfulLinks';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all product accesses for the user
  const accesses = await prisma.userProductAccess.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      product: { select: { id: true, name: true } }
    }
  });

  if (accesses.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch links for all products in parallel
  const groups = await Promise.all(
    accesses.map(async (access) => {
      const setting = await prisma.portalSetting.findUnique({
        where: { key: getHelpfulLinksKey(access.product.id) },
        select: { value: true }
      });
      const links = Array.isArray(setting?.value) ? setting.value : [];
      if (links.length === 0) return null;
      return {
        productId: access.product.id,
        productName: access.product.name,
        links
      };
    })
  );

  // Filter out products with no links
  return NextResponse.json(groups.filter(Boolean));
}
