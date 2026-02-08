import type { Task as PrismaTask, Comment as PrismaComment, User, Country } from '@prisma/client';
import { Status, Priority, Task as UiTask, Comment as UiComment } from '../../../types';

const statusMap: Record<string, Status> = {
  DRAFT: Status.PENDING,
  READY: Status.PENDING,
  IN_PROGRESS: Status.IN_PROGRESS,
  BLOCKED: Status.BLOCKED,
  PASSED: Status.PASSED,
  FAILED: Status.FAILED,
  DEPLOYED: Status.DEPLOYED
};

const priorityMap: Record<string, Priority> = {
  LOW: Priority.LOW,
  MEDIUM: Priority.MEDIUM,
  HIGH: Priority.HIGH
};

export const mapStatusToUi = (status: string): Status => {
  return statusMap[status] ?? Status.PENDING;
};

export const mapPriorityToUi = (priority: string): Priority => {
  return priorityMap[priority] ?? Priority.MEDIUM;
};

export const mapUiStatusToDb = (status: string): string => {
  const normalized = status.toUpperCase().replace(' ', '_');
  if (['DRAFT', 'READY', 'IN_PROGRESS', 'BLOCKED', 'PASSED', 'FAILED', 'DEPLOYED'].includes(normalized)) {
    return normalized;
  }
  if (status === Status.PENDING) return 'READY';
  if (status === Status.IN_PROGRESS) return 'IN_PROGRESS';
  if (status === Status.BLOCKED) return 'BLOCKED';
  if (status === Status.PASSED) return 'PASSED';
  if (status === Status.FAILED) return 'FAILED';
  if (status === Status.DEPLOYED) return 'DEPLOYED';
  return 'READY';
};

const buildSteps = (taskId: string, comments: UiComment[]) => [
  {
    id: `${taskId}-step-1`,
    description: 'Execute the UAT scenario steps',
    expectedResult: 'Feature behaves as expected',
    testData: 'N/A',
    isPassed: null,
    comments
  },
  {
    id: `${taskId}-step-2`,
    description: 'Verify edge cases for the module',
    expectedResult: 'No regressions found',
    testData: 'N/A',
    isPassed: null,
    comments: []
  },
  {
    id: `${taskId}-step-3`,
    description: 'Confirm reporting/logging outputs',
    expectedResult: 'Reports are accurate',
    testData: 'N/A',
    isPassed: null,
    comments: []
  }
];

const mapComments = (comments: Array<PrismaComment & { author: User }>): UiComment[] => {
  return comments.map((comment) => ({
    id: comment.id,
    userId: comment.author.name || comment.author.email,
    text: comment.body,
    createdAt: comment.createdAt.toLocaleString()
  }));
};

export const mapTaskToUi = (
  task: PrismaTask & { assignee?: User | null; country?: Country | null; comments?: Array<PrismaComment & { author: User }> }
): UiTask => {
  const uiComments = task.comments ? mapComments(task.comments) : [];

  return {
    id: task.id,
    title: task.title,
    description: task.description ?? '',
    featureModule: task.module,
    status: mapStatusToUi(task.status),
    priority: mapPriorityToUi(task.priority),
    countryCode: task.countryCode,
    assigneeId: task.assigneeId ?? '',
    dueDate: task.dueDate ? task.dueDate.toISOString().split('T')[0] : '',
    steps: buildSteps(task.id, uiComments),
    updatedAt: task.updatedAt.toISOString(),
    scope: 'Local',
    targetSystem: 'Ordering Portal',
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          name: task.assignee.name,
          email: task.assignee.email
        }
      : undefined,
    country: task.country
      ? {
          code: task.country.code,
          name: task.country.name
        }
      : undefined
  };
};
