import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useCurrentOrgId, isOrgIdValid } from '@/lib/query/hooks/use-org-id';
import { CACHE_TIMES } from '@/lib/query/cache-config';
import { queryKeys } from '@/lib/query/query-keys';
import { toast } from 'sonner';

interface ExecutionListResult {
  items: Record<string, unknown>[];
  total: number;
}

interface ExecutionEventRecord {
  id: string;
  executionId: string;
  seq: number;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface ExecutionEventsResult {
  items: ExecutionEventRecord[];
  total: number;
  lastSeq: number;
  nextAfterSeq: number;
  returnedCount: number;
  hasMore: boolean;
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

interface UseLiveExecutionEventsReturn {
  events: ExecutionEventRecord[];
  lastSeq: number;
  hasMore: boolean;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

function mergeEvents(existing: ExecutionEventRecord[], incoming: ExecutionEventRecord[]): ExecutionEventRecord[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const existingSeqs = new Set(existing.map((e) => e.seq));
  const newEvents = incoming.filter((e) => !existingSeqs.has(e.seq));

  if (newEvents.length === 0) return existing;

  return [...existing, ...newEvents].sort((a, b) => a.seq - b.seq);
}

interface LiveEventsState {
  events: ExecutionEventRecord[];
  afterSeq: number | undefined;
  lastSeq: number;
  hasMore: boolean;
  isInitial: boolean;
}

const INITIAL_LIVE_STATE: LiveEventsState = {
  events: [],
  afterSeq: undefined,
  lastSeq: 0,
  hasMore: false,
  isInitial: true,
};

export function useLiveExecutionEvents(id: string, enabled = true): UseLiveExecutionEventsReturn {
  const orgId = useCurrentOrgId();
  const [prevId, setPrevId] = useState(id);
  const [liveState, setLiveState] = useState<LiveEventsState>(INITIAL_LIVE_STATE);

  if (prevId !== id) {
    setPrevId(id);
    setLiveState(INITIAL_LIVE_STATE);
  }

  const shouldFetch = enabled && !!id && isOrgIdValid(orgId);

  const queryResult = useQuery({
    queryKey: [...queryKeys.executions.all(orgId), 'live-events', id, liveState.afterSeq ?? 0] as const,
    queryFn: () => fetchExecutionEvents(id, liveState.afterSeq),
    enabled: shouldFetch,
    refetchInterval: shouldFetch ? 3000 : false,
    ...CACHE_TIMES.STANDARD,
  });

  const data = queryResult.data;
  if (data && liveState.isInitial) {
    setLiveState({
      events: data.items,
      afterSeq: data.items.length > 0 ? data.items[data.items.length - 1].seq : undefined,
      lastSeq: data.lastSeq ?? 0,
      hasMore: data.hasMore ?? false,
      isInitial: false,
    });
  } else if (data && data.items.length > 0) {
    setLiveState((prev) => {
      const merged = mergeEvents(prev.events, data.items);
      if (merged === prev.events) return prev;
      return {
        ...prev,
        events: merged,
        afterSeq: data.items[data.items.length - 1].seq,
        lastSeq: data.lastSeq ?? 0,
        hasMore: data.hasMore ?? false,
      };
    });
  }

  return {
    events: liveState.events,
    lastSeq: liveState.lastSeq,
    hasMore: liveState.hasMore,
    isLoading: queryResult.isLoading,
    isFetching: queryResult.isFetching,
    error: queryResult.error,
  };
}

async function killExecution(id: string): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/executions/${id}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'CANCELLED',
      errorMessage: 'Execution killed by user',
    }),
  });
  if (!res.ok) throw new Error('Failed to kill execution');
  const json = await res.json();
  return json.data;
}

export function useKillExecution() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: killExecution,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.executions.list(orgId) });
      toast.success('Execução finalizada');
    },
    onError: () => {
      toast.error('Erro ao finalizar execução');
    },
  });
}
