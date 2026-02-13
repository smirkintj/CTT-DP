import { ActivityType } from '@prisma/client';
import prisma from './prisma';

const statusLabelMap: Record<string, string> = {
  READY: 'Ready',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
  DEPLOYED: 'Deployed',
  BLOCKED: 'Blocked',
  DRAFT: 'Draft'
};

export function toStatusLabel(rawStatus: string) {
  const key = rawStatus.toUpperCase();
  return statusLabelMap[key] ?? rawStatus;
}

export async function createActivity(params: {
  type: ActivityType;
  message: string;
  taskId?: string;
  actorId?: string;
  countryCode?: string | null;
}) {
  await prisma.activity.create({
    data: {
      type: params.type,
      message: params.message,
      taskId: params.taskId,
      actorId: params.actorId,
      countryCode: params.countryCode ?? null
    }
  });
}
