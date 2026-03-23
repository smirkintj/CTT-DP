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

  // Resolve the user's product — take the earliest-assigned product access.
  const access = await prisma.userProductAccess.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
    select: { productId: true }
  });

  if (!access) {
    return NextResponse.json([]);
  }

  const setting = await prisma.portalSetting.findUnique({
    where: { key: getHelpfulLinksKey(access.productId) },
    select: { value: true }
  });

  return NextResponse.json(Array.isArray(setting?.value) ? setting.value : []);
}
