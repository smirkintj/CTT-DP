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

  const keys = accesses.map((a) => getHelpfulLinksKey(a.product.id));
  const settings = await prisma.portalSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true }
  });
  const settingsByKey = new Map(settings.map((s) => [s.key, s.value]));

  const groups = accesses
    .map((access) => {
      const value = settingsByKey.get(getHelpfulLinksKey(access.product.id));
      const links = Array.isArray(value) ? value : [];
      if (links.length === 0) return null;
      return { productId: access.product.id, productName: access.product.name, links };
    })
    .filter(Boolean);

  return NextResponse.json(groups);
}
