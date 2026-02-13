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
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    countryCode: task.countryCode,
    module: task.module,
    featureModule: task.module,
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
      createdAt: step.createdAt ? step.createdAt.toISOString() : '',
      updatedAt: step.updatedAt ? step.updatedAt.toISOString() : ''
    })),

    comments: comments.map((c: any) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: {
        id: c.author.id,
        name: c.author.name,
        email: c.author.email
      }
    }))
  };
}
