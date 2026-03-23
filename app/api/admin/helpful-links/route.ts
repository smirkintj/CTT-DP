import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import prisma from '../../../../lib/prisma';
import { getHelpfulLinksKey } from '../../../../lib/helpfulLinks';
import { randomUUID } from 'crypto';

const isValidUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const productId = new URL(req.url).searchParams.get('productId');
  if (!productId) {
    return NextResponse.json({ error: 'productId is required', code: 'PRODUCT_ID_REQUIRED' }, { status: 400 });
  }

  const setting = await prisma.portalSetting.findUnique({
    where: { key: getHelpfulLinksKey(productId) },
    select: { value: true }
  });

  return NextResponse.json(Array.isArray(setting?.value) ? setting.value : []);
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
  const productId = body?.productId?.toString().trim();
  if (!productId) {
    return NextResponse.json({ error: 'productId is required', code: 'PRODUCT_ID_REQUIRED' }, { status: 400 });
  }

  const links = Array.isArray(body?.links) ? body.links : null;
  if (links === null) {
    return NextResponse.json({ error: 'links must be an array', code: 'HELPFUL_LINKS_INVALID' }, { status: 400 });
  }
  if (links.length > 5) {
    return NextResponse.json({ error: 'Max 5 links allowed', code: 'HELPFUL_LINKS_MAX_EXCEEDED' }, { status: 400 });
  }

  for (const link of links) {
    const label = (link?.label || '').toString().trim();
    const url = (link?.url || '').toString().trim();
    if (!label) {
      return NextResponse.json({ error: 'Link label is required', code: 'HELPFUL_LINKS_LABEL_REQUIRED' }, { status: 400 });
    }
    if (!url || !isValidUrl(url)) {
      return NextResponse.json({ error: `Invalid URL for "${label}"`, code: 'HELPFUL_LINKS_URL_INVALID' }, { status: 400 });
    }
  }

  // Server regenerates all IDs to prevent malformed/duplicate client IDs.
  const sanitised = links.map((link: { label: string; url: string }) => ({
    id: randomUUID(),
    label: link.label.toString().trim(),
    url: link.url.toString().trim()
  }));

  const key = getHelpfulLinksKey(productId);
  const saved = await prisma.portalSetting.upsert({
    where: { key },
    create: { key, value: sanitised, updatedById: session.user.id },
    update: { value: sanitised, updatedById: session.user.id },
    select: { value: true }
  });

  return NextResponse.json(saved.value);
}
