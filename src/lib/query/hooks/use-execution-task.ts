import { useQuery } from '@tanstack/react-query';
import { useCurrentOrgId, isOrgIdValid } from './use-org-id';
import { CACHE_TIMES } from '../cache-config';
import { queryKeys } from '../query-keys';
import type { TaskWithReadableId } from '@/shared/types';

async function fetchTaskById(id: string): Promise<TaskWithReadableId> {
  const res = await fetch(`/api/tasks/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch task ${id}`);
  const json = await res.json();
  return json.data;
}

export function useExecutionTask(taskId: string | null, enabled = true) {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: [...queryKeys.tasks.details(orgId), taskId ?? 'none'],
    queryFn: () => fetchTaskById(taskId!),
    enabled: enabled && !!taskId && isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}