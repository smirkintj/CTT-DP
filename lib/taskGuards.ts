import { TaskStatus } from '@prisma/client';

const ALLOWED_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: ['READY'],
  READY: ['IN_PROGRESS', 'BLOCKED', 'FAILED', 'PASSED'],
  IN_PROGRESS: ['READY', 'BLOCKED', 'FAILED', 'PASSED'],
  BLOCKED: ['READY', 'IN_PROGRESS', 'FAILED'],
  FAILED: ['READY', 'IN_PROGRESS', 'BLOCKED', 'PASSED'],
  PASSED: ['IN_PROGRESS', 'BLOCKED', 'FAILED', 'DEPLOYED'],
  DEPLOYED: []
};

export function validateTaskTransition(from: TaskStatus, to: TaskStatus): string | null {
  if (from === to) return null;
  const allowedTargets = ALLOWED_TASK_TRANSITIONS[from] ?? [];
  if (allowedTargets.includes(to)) return null;
  return `Invalid status transition from ${from} to ${to}`;
}

export function validateExpectedUpdatedAt(
  actualUpdatedAt: Date,
  expectedUpdatedAt: unknown
): string | null {
  if (typeof expectedUpdatedAt === 'undefined' || expectedUpdatedAt === null) {
    return null;
  }

  if (typeof expectedUpdatedAt !== 'string') {
    return 'Invalid expectedUpdatedAt';
  }

  const expected = new Date(expectedUpdatedAt);
  if (Number.isNaN(expected.getTime())) {
    return 'Invalid expectedUpdatedAt';
  }

  if (actualUpdatedAt.getTime() !== expected.getTime()) {
    return 'Task was updated by another user. Refresh and try again.';
  }

  return null;
}
