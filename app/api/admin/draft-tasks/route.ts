import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import prisma from '../../../../lib/prisma';
import { unauthorized, forbidden } from '../../../../lib/apiError';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const drafts = await prisma.draftTask.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      product: { select: { id: true, name: true, slug: true } },
      reviewedBy: { select: { id: true, name: true } }
    }
  });

  return NextResponse.json(drafts);
}
