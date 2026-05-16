// app/api/admin/sit-tasks/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { unauthorized, forbidden } from '@/lib/apiError';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized();
  if (session.user.role !== 'ADMIN') return forbidden();

  // Admin sees all SIT tasks (no product scope restriction for admins in this system)
  const tasks = await prisma.sitTask.findMany({
    include: {
      product: { select: { name: true } },
      assignee: { select: { name: true, email: true } },
      countries: { select: { countryCode: true } },
      testCases: {
        select: {
          id: true,
          status: true,
          conditionalNote: true,
          adminAcknowledgedAt: true,
          seqId: true,
          name: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(
    tasks.map((t) => ({
      id: t.id,
      sprintName: t.sprintName,
      jiraTicket: t.jiraTicket,
      title: t.title,
      productId: t.productId,
      productName: t.product.name,
      status: t.status,
      assigneeName: t.assignee?.name ?? t.assignee?.email ?? null,
      signedOffAt: t.signedOffAt?.toISOString() ?? null,
      countryCodes: t.countries.map((c) => c.countryCode),
      conditionalCases: t.testCases
        .filter((tc) => tc.status === 'CONDITIONAL')
        .map((tc) => ({
          id: tc.id,
          seqId: tc.seqId,
          name: tc.name,
          conditionalNote: tc.conditionalNote,
          adminAcknowledgedAt: tc.adminAcknowledgedAt?.toISOString() ?? null,
        })),
      hasUnacknowledgedConditionals: t.testCases.some(
        (tc) => tc.status === 'CONDITIONAL' && !tc.adminAcknowledgedAt
      ),
      updatedAt: t.updatedAt.toISOString(),
    }))
  );
}
