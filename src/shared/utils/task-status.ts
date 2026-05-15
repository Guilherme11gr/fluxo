import type { TaskStatus } from '@/shared/types';

export const ACTIVE_TASK_STATUSES: TaskStatus[] = ['TODO', 'DOING', 'REVIEW', 'QA_READY'];

export function isActiveTaskStatus(status: TaskStatus | null | undefined): boolean {
  return status !== undefined && status !== null && ACTIVE_TASK_STATUSES.includes(status);
}
