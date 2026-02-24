import { NextResponse } from 'next/server';
import prisma from '../../../../lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isAdmin = session.user.role === 'ADMIN';

  const where = isAdmin
    ? {
        authorId: { not: session.user.id },
        reads: {
          none: {
            userId: session.user.id
          }
        }
      }
    : {
        authorId: { not: session.user.id },
        task: {
          assigneeId: session.user.id
        },
        reads: {
          none: {
            userId: session.user.id
          }
        }
      };

  const count = await prisma.comment.count({ where });

  return NextResponse.json({ count });
}

