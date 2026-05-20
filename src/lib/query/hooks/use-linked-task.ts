/**
 * Lightweight hook to fetch a linked task preview for the Personal Board.
 * TODO(Caminho2): when PersonalBoardItem carries linked task fields directly,
 * remove this client-side fetch and use the embedded data.
 */
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../query-keys';
import { CACHE_TIMES } from '../cache-config';
import { useCurrentOrgId, isOrgIdValid } from './use-org-id';
import type { TaskWithReadableId } from '@/shared/types';

export interface LinkedTaskPreview {
  id: string;
  readableId: string;
  title: string;
  status: string;
  currentExecutionId?: string | null;
}

async function fetchLinkedTask(taskId: string): Promise<LinkedTaskPreview | null> {
  const res = await fetch(`/api/tasks/${taskId}`);
  if (!res.ok) return null;
  const json = await res.json();
  const task: TaskWithReadableId | undefined = json?.data;
  if (!task) return null;
  return {
    id: task.id,
    readableId: task.readableId,
    title: task.title,
    status: task.status,
    currentExecutionId: task.currentExecutionId,
  };
}

export function useLinkedTaskPreview(taskId: string | null | undefined) {
  const orgId = useCurrentOrgId();
  return useQuery({
    queryKey: queryKeys.tasks.detail(orgId, taskId || ''),
    queryFn: () => fetchLinkedTask(taskId!),
    enabled: isOrgIdValid(orgId) && !!taskId,
    ...CACHE_TIMES.STANDARD,
  });
}
