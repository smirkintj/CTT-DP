import { TaskHistoryAction } from '@prisma/client';
import prisma from './prisma';

type CreateTaskHistoryInput = {
  taskId: string;
  actorId?: string | null;
  action: TaskHistoryAction;
  message: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

export async function createTaskHistory(input: CreateTaskHistoryInput) {
  try {
    await prisma.taskHistory.create({
      data: {
        taskId: input.taskId,
        actorId: input.actorId ?? null,
        action: input.action,
        message: input.message,
        before: input.before as object | undefined,
        after: input.after as object | undefined,
        metadata: input.metadata as object | undefined
      }
    });
  } catch (error) {
    // Keep user flows resilient if history table is temporarily unavailable.
    if (process.env.NODE_ENV !== 'production') {
      console.error('taskHistory create failed:', error);
    }
  }
}
