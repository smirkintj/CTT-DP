import { ActivityType } from '@prisma/client';
import prisma from './prisma';

type AdminAuditInput = {
  actorId?: string | null;
  message: string;
  countryCode?: string | null;
  metadata?: unknown;
};

export async function createAdminAudit(input: AdminAuditInput) {
  try {
    await prisma.activity.create({
      data: {
        type: ActivityType.STATUS_CHANGED,
        actorId: input.actorId ?? null,
        countryCode: input.countryCode ?? null,
        message:
          input.metadata && process.env.NODE_ENV !== 'production'
            ? `${input.message} ${JSON.stringify(input.metadata)}`
            : input.message
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('createAdminAudit failed:', error);
    }
  }
}
