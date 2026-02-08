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
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    countryCode: task.countryCode,
    module: task.module,
    dueDate: task.dueDate.toISOString(),

    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name,
          email: task.assignee.email,
          countryCode: task.assignee.countryCode
        }
      : undefined,

    comments: task.comments.map((c: any) => ({
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
