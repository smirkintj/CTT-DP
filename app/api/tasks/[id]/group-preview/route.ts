import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { badRequest, forbidden, notFound, unauthorized } from '@/lib/apiError';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const { id } = await params;
  if (!id) return badRequest('Missing id', 'TASK_ID_MISSING');

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      taskGroupId: true,
      countryCode: true
    }
  });

  if (!task) return notFound('Not found', 'TASK_NOT_FOUND');

  if (!task.taskGroupId) {
    return Response.json({
      enabled: false,
      reason: 'Task is not part of a multi-market group',
      total: 1,
      updatable: 1,
      signedOffLocked: 0,
      countries: [task.countryCode]
    });
  }

  const groupTasks = await prisma.task.findMany({
    where: { taskGroupId: task.taskGroupId },
    select: {
      id: true,
      countryCode: true,
      signedOffAt: true
    },
    orderBy: { countryCode: 'asc' }
  });

  const signedOffLocked = groupTasks.filter((t) => !!t.signedOffAt).length;

  return Response.json({
    enabled: true,
    taskGroupId: task.taskGroupId,
    total: groupTasks.length,
    updatable: groupTasks.length - signedOffLocked,
    signedOffLocked,
    countries: groupTasks.map((t) => t.countryCode)
  });
}
