import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import prisma from '../../../../lib/prisma';
import { DEFAULT_HELPFUL_LINKS, HELPFUL_LINKS_SETTING_KEY } from '../../../../lib/helpfulLinks';

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const setting = await prisma.portalSetting.findUnique({
    where: { key: HELPFUL_LINKS_SETTING_KEY },
    select: { value: true }
  });

  return NextResponse.json(Array.isArray(setting?.value) ? setting.value : DEFAULT_HELPFUL_LINKS);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const links = Array.isArray(body?.links) ? body.links : null;
  if (!links || links.length === 0) {
    return NextResponse.json({ error: 'At least one link is required' }, { status: 400 });
  }

  for (const link of links) {
    const label = (link?.label || '').toString().trim();
    const url = (link?.url || '').toString().trim();
    if (!label) {
      return NextResponse.json({ error: 'Link label is required' }, { status: 400 });
    }
    if (!url || !isValidUrl(url)) {
      return NextResponse.json({ error: `Invalid URL for "${label || 'link'}"` }, { status: 400 });
    }
  }

  const saved = await prisma.portalSetting.upsert({
    where: { key: HELPFUL_LINKS_SETTING_KEY },
    create: {
      key: HELPFUL_LINKS_SETTING_KEY,
      value: links,
      updatedById: session.user.id
    },
    update: {
      value: links,
      updatedById: session.user.id
    },
    select: { value: true }
  });

  return NextResponse.json(saved.value);
}
