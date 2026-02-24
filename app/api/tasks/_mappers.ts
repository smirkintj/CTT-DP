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

  const extractStepComment = (body: string) => {
    const match = body.match(/^\[\[STEP:(\d+)\]\]\s*/i);
    if (!match) return { stepOrder: null, cleanedBody: body };
    const stepOrder = Number(match[1]);
    const cleanedBody = body.replace(/^\[\[STEP:\d+\]\]\s*/i, '');
    return { stepOrder: Number.isNaN(stepOrder) ? null : stepOrder, cleanedBody };
  };

  for (const c of comments) {
    const { stepOrder, cleanedBody } = extractStepComment(c.body ?? '');
    if (!stepOrder) continue;
    const authorName = c.author?.name || c.author?.email || 'User';
    if (!stepCommentMap.has(stepOrder)) {
      stepCommentMap.set(stepOrder, []);
    }
    stepCommentMap.get(stepOrder)!.push({
      id: c.id,
      userId: authorName,
      text: cleanedBody,
      createdAt: c.createdAt ? c.createdAt.toISOString() : ''
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
    dueDate: task.dueDate ? task.dueDate.toISOString() : '',
    createdAt: task.createdAt ? task.createdAt.toISOString() : '',
    updatedAt: task.updatedAt ? task.updatedAt.toISOString() : '',
    signedOffAt: task.signedOffAt ? task.signedOffAt.toISOString() : null,

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
      createdAt: step.createdAt ? step.createdAt.toISOString() : '',
      updatedAt: step.updatedAt ? step.updatedAt.toISOString() : ''
    })),

    comments: comments.map((c: any) => ({
      id: c.id,
      body: extractStepComment(c.body ?? '').cleanedBody,
      createdAt: c.createdAt.toISOString(),
      author: {
        id: c.author?.id ?? '',
        name: c.author?.name ?? c.author?.email ?? 'User',
        email: c.author?.email ?? ''
      }
    }))
  };
}
