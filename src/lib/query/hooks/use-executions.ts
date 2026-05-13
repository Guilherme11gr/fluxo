import { useQuery } from '@tanstack/react-query';
import { useCurrentOrgId, isOrgIdValid } from '@/lib/query/hooks/use-org-id';
import { CACHE_TIMES } from '@/lib/query/cache-config';
import { queryKeys } from '@/lib/query/query-keys';

interface ExecutionListResult {
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