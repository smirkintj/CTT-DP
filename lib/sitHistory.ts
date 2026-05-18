// lib/sitHistory.ts
import { Prisma, SitHistoryAction } from '@prisma/client';
import prisma from './prisma';

interface CreateSitHistoryParams {
  sitTaskId: string;
  actorId: string;
  action: SitHistoryAction;
  message: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}

export async function createSitHistory({
  sitTaskId,
  actorId,
  action,
  message,
  before,
  after,
}: CreateSitHistoryParams): Promise<void> {
  try {
    await prisma.sitTaskHistory.create({
      data: {
        sitTaskId,
        actorId,
        action,
        message,
        before: before ?? undefined,
        after: after ?? undefined,
      },
    });
  } catch (error) {
    // Keep user flows resilient if history table is temporarily unavailable.
    if (process.env.NODE_ENV !== 'production') {
      console.error('sitHistory create failed:', error);
    }
  }
}
