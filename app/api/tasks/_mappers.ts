import { TaskStatus } from '@prisma/client';
import { TaskDTO } from './_types';

const statusMap: Record<string, TaskStatus> = {
  Pending: TaskStatus.READY,
  'In Progress': TaskStatus.IN_PROGRESS,
  Passed: TaskStatus.PASSED,
  Failed: TaskStatus.FAILED,
  Blocked: TaskStatus.BLOCKED,
  Deployed: TaskStatus.DEPLOYED
};

export function mapUiStatusToDb(status: string): TaskStatus {
  if (Object.values(TaskStatus).includes(status as TaskStatus)) {
    return status as TaskStatus;
  }
  return statusMap[status] ?? TaskStatus.READY;
}

export function mapTaskToUi(task: any): TaskDTO {
  const comments = Array.isArray(task.comments) ? task.comments : [];
  const steps = Array.isArray(task.steps) ? task.steps : [];
  const stepCommentMap = new Map<number, Array<{ id: string; userId: string; text: string; createdAt: string }>>();
  const stripLegacyMarker = (body: string) => body.replace(/^\[\[STEP:\d+\]\]\s*/i, '');
  const toIso = (value: unknown): string => {
    if (!value) return '';
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    }
    const parsed = new Date(value as string);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  };

  for (const c of comments) {
    if (typeof c.stepOrder !== 'number') continue;
    const authorName = c.author?.name || c.author?.email || 'User';
    if (!stepCommentMap.has(c.stepOrder)) {
      stepCommentMap.set(c.stepOrder, []);
    }
    stepCommentMap.get(c.stepOrder)!.push({
      id: c.id,
      userId: authorName,
      text: stripLegacyMarker(c.body ?? ''),
      createdAt: toIso(c.createdAt)
    });
  }

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    countryCode: task.countryCode,
    module: task.module,
    featureModule: task.module,
    jiraTicket: task.jiraTicket ?? null,
    crNumber: task.crNumber ?? null,
    developer: task.developer ?? null,
    dueDate: toIso(task.dueDate),
    createdAt: toIso(task.createdAt),
    updatedAt: toIso(task.updatedAt),
    signedOffAt: toIso(task.signedOffAt) || null,

    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name,
          email: task.assignee.email,
          countryCode: task.assignee.countryCode
        }
      : undefined,

    updatedBy: task.updatedBy
      ? {
          id: task.updatedBy.id,
          name: task.updatedBy.name,
          email: task.updatedBy.email
        }
      : undefined,

    signedOffBy: task.signedOffBy
      ? {
          id: task.signedOffBy.id,
          name: task.signedOffBy.name,
          email: task.signedOffBy.email
        }
      : undefined,

    steps: steps.map((step: any) => ({
      id: step.id,
      order: step.order,
      description: step.description,
      expectedResult: step.expectedResult,
      testData: step.testData ?? null,
      actualResult: step.actualResult ?? null,
      isPassed: step.isPassed ?? null,
      attachments: step.attachments ?? null,
      comments: stepCommentMap.get(step.order) ?? [],
      createdAt: toIso(step.createdAt),
      updatedAt: toIso(step.updatedAt)
    })),

    comments: comments.map((c: any) => ({
      id: c.id,
      body: stripLegacyMarker(c.body ?? ''),
      createdAt: toIso(c.createdAt),
      author: {
        id: c.author?.id ?? '',
        name: c.author?.name ?? c.author?.email ?? 'User',
        email: c.author?.email ?? ''
      }
    }))
  };
}
