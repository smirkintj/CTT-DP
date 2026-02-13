import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const activityId = body?.activityId as string | undefined;
  const markAll = body?.all === true;

  if (!activityId && !markAll) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (markAll) {
    const isAdmin = session.user.role === 'ADMIN';
    const where = isAdmin
      ? {}
      : {
          OR: [
            { actorId: session.user.id },
            { task: { assigneeId: session.user.id } },
            ...(session.user.countryCode ? [{ countryCode: session.user.countryCode }] : [])
          ]
        };

    const activities = await prisma.activity.findMany({
      where,
      select: { id: true },
      orderBy: { createdAt: 'desc' },
      take: 200
    });

    if (activities.length > 0) {
      await prisma.activityRead.createMany({
        data: activities.map((item) => ({
          userId: session.user.id,
          activityId: item.id
        })),
        skipDuplicates: true
      });
    }

    return NextResponse.json({ ok: true });
  }

  await prisma.activityRead.upsert({
    where: {
      activityId_userId: {
        activityId: activityId!,
        userId: session.user.id
      }
    },
    update: {
      readAt: new Date()
    },
    create: {
      activityId: activityId!,
      userId: session.user.id
    }
  });

  return NextResponse.json({ ok: true });
}
