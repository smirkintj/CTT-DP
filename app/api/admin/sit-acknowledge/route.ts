import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { badRequest, forbidden, unauthorized } from '@/lib/apiError';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const body = await req.json().catch(() => null);
  const jiraTicket = body?.jiraTicket?.toString().trim();
  const sitComment = body?.sitComment?.toString().trim() || null;

  if (!jiraTicket) return badRequest('jiraTicket is required', 'JIRA_TICKET_REQUIRED');

  const now = new Date();

  // Mark all tasks sharing this Jira ticket as SIT signed off
  const result = await prisma.task.updateMany({
    where: {
      jiraTicket,
      sitSignedOffAt: null // only update tasks not yet acknowledged
    },
    data: {
      sitSignedOffAt: now,
      sitComment
    }
  });

  return NextResponse.json({ acknowledged: result.count, jiraTicket, sitSignedOffAt: now.toISOString() });
}
