import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import prisma from '../../../lib/prisma';
import { DEFAULT_HELPFUL_LINKS, HELPFUL_LINKS_SETTING_KEY } from '../../../lib/helpfulLinks';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const setting = await prisma.portalSetting.findUnique({
    where: { key: HELPFUL_LINKS_SETTING_KEY },
    select: { value: true }
  });

  const links = Array.isArray(setting?.value) ? setting?.value : DEFAULT_HELPFUL_LINKS;
  return NextResponse.json(links);
}
