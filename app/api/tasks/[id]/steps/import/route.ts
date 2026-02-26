import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { badRequest, forbidden, internalError, notFound, unauthorized } from '@/lib/apiError';
import { createTaskHistory } from '@/lib/taskHistory';
import { TaskHistoryAction } from '@prisma/client';
import { mapTaskToUi } from '../../../_mappers';
import { taskRelationIncludeFull, taskRelationIncludeSafe } from '../../../_query';

type ImportStepInput = {
  description?: string;
  expectedResult?: string;
  testData?: string;
  actualResult?: string;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return unauthorized('Unauthorized', 'AUTH_REQUIRED');
  if (session.user.role !== 'ADMIN') return forbidden('Forbidden', 'ADMIN_REQUIRED');

  const { id: taskId } = await params;
  if (!taskId) return badRequest('Task id is required', 'TASK_ID_REQUIRED');

  const body = await req.json().catch(() => null);
  const steps = Array.isArray(body?.steps) ? (body.steps as ImportStepInput[]) : [];
  if (steps.length === 0) return badRequest('At least one step is required', 'STEPS_REQUIRED');

  const normalized = steps.map((step, index) => ({
    order: index + 1,
    description: typeof step.description === 'string' ? step.description.trim() : '',
    expectedResult: typeof step.expectedResult === 'string' ? step.expectedResult.trim() : '',
    testData: typeof step.testData === 'string' ? step.testData.trim() : null,
    actualResult: typeof step.actualResult === 'string' ? step.actualResult.trim() : null
  }));

  if (normalized.some((step) => !step.description || !step.expectedResult)) {
    return badRequest('Each step needs description and expected result', 'STEP_INVALID');
  }

  try {
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      include: { steps: { orderBy: { order: 'asc' } } }
    });
    if (!existingTask) return notFound('Task not found', 'TASK_NOT_FOUND');
    if (existingTask.signedOffAt) {
      return forbidden('Task is signed off and cannot be edited', 'TASK_LOCKED_SIGNED_OFF');
    }

    await prisma.$transaction(async (tx) => {
      await tx.taskStep.deleteMany({ where: { taskId } });
      await tx.taskStep.createMany({
        data: normalized.map((step) => ({
          taskId,
          order: step.order,
          description: step.description,
          expectedResult: step.expectedResult,
          testData: step.testData,
          actualResult: step.actualResult
        }))
      });
      await tx.task.update({
        where: { id: taskId },
        data: { updatedAt: new Date() }
      });
    });

    await createTaskHistory({
      taskId,
      actorId: session.user.id,
      action: TaskHistoryAction.STEP_UPDATED,
      message: `${session.user.name || session.user.email || 'Admin'} replaced task steps via import.`,
      before: {
        stepCount: existingTask.steps.length
      },
      after: {
        stepCount: normalized.length
      },
      metadata: {
        source: 'IMPORT_WIZARD'
      }
    });

    let refreshedTask = null;
    try {
      refreshedTask = await prisma.task.findUnique({
        where: { id: taskId },
        include: taskRelationIncludeFull
      });
    } catch {
      refreshedTask = await prisma.task.findUnique({
        where: { id: taskId },
        include: taskRelationIncludeSafe
      });
    }
    if (!refreshedTask) return notFound('Task not found', 'TASK_NOT_FOUND');

    return Response.json(mapTaskToUi(refreshedTask));
  } catch (error) {
    return internalError('Failed to import steps', 'STEP_IMPORT_FAILED', String(error));
  }
}
