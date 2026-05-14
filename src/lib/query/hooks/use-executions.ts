import { useQuery } from '@tanstack/react-query';
import { useCurrentOrgId, isOrgIdValid } from '@/lib/query/hooks/use-org-id';
import { CACHE_TIMES } from '@/lib/query/cache-config';
import { queryKeys } from '@/lib/query/query-keys';

interface ExecutionListResult {
  items: Record<string, unknown>[];
  total: number;
}

interface ExecutionEventsResult {
  items: Record<string, unknown>[];
  total: number;
}

async function fetchExecutions(orgId: string, filters?: Record<string, string>): Promise<ExecutionListResult> {
  const params = new URLSearchParams(filters);
  const res = await fetch(`/api/executions?${params}`);
  if (!res.ok) throw new Error('Failed to fetch executions');
  const json = await res.json();
  return json.data;
}

async function fetchExecution(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/executions/${id}`);
  if (!res.ok) throw new Error('Failed to fetch execution');
  const json = await res.json();
  return json.data;
}

async function fetchExecutionEvents(id: string, afterSeq?: number): Promise<ExecutionEventsResult> {
  const params = new URLSearchParams();
  if (afterSeq !== undefined) params.set('afterSeq', String(afterSeq));
  const res = await fetch(`/api/executions/${id}/events?${params}`);
  if (!res.ok) throw new Error('Failed to fetch execution events');
  const json = await res.json();
  return json.data;
}

export function useExecutions(filters?: Record<string, string>) {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: queryKeys.executions.list(orgId, filters),
    queryFn: () => fetchExecutions(orgId, filters),
    enabled: isOrgIdValid(orgId),
    ...CACHE_TIMES.FRESH,
  });
}

export function useExecution(id: string) {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: queryKeys.executions.detail(orgId, id),
    queryFn: () => fetchExecution(id),
    enabled: !!id && isOrgIdValid(orgId),
    ...CACHE_TIMES.STANDARD,
  });
}

export function useLiveExecution(id: string, enabled = true) {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: queryKeys.executions.detail(orgId, id),
    queryFn: () => fetchExecution(id),
    enabled: enabled && !!id && isOrgIdValid(orgId),
    refetchInterval: (query) => {
      const status = String((query.state.data as Record<string, unknown> | undefined)?.status ?? '');
      return status === 'CLAIMED' || status === 'RUNNING' ? 3000 : false;
    },
    ...CACHE_TIMES.STANDARD,
  });
}

export function useExecutionEvents(id: string, afterSeq?: number, enabled = true) {
  const orgId = useCurrentOrgId();

  return useQuery({
    queryKey: queryKeys.executions.events(orgId, id, afterSeq),
    queryFn: () => fetchExecutionEvents(id, afterSeq),
    enabled: enabled && !!id && isOrgIdValid(orgId),
    refetchInterval: 3000,
    ...CACHE_TIMES.STANDARD,
  });
}
