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
        // Never embed `metadata` (internal IDs, action codes) into the stored
        // message — this Activity feed is also read by non-admin users, so
        // anything written here is potentially user-facing.
        message: input.message
      }
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('createAdminAudit failed:', error);
    }
  }
}
