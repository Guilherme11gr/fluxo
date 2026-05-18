import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentOrgId, isOrgIdValid } from '@/lib/query/hooks/use-org-id';

interface ExecutionEventRecord {
  id: string;
  executionId: string;
  seq: number;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface UseExecutionStreamReturn {
  events: ExecutionEventRecord[];
  lastSeq: number;
  isConnected: boolean;
  mode: 'sse' | 'polling' | 'disconnected';
  error: Error | null;
  reset: () => void;
}

async function fetchExecutionEvents(id: string, afterSeq?: number): Promise<{ items: ExecutionEventRecord[]; lastSeq: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (afterSeq !== undefined) params.set('afterSeq', String(afterSeq));
  const res = await fetch(`/api/executions/${id}/events?${params}`);
  if (!res.ok) throw new Error('Failed to fetch execution events');
  const json = await res.json();
  return json.data;
}

function mergeEvents(existing: ExecutionEventRecord[], incoming: ExecutionEventRecord[]): ExecutionEventRecord[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const existingSeqs = new Set(existing.map((e) => e.seq));
  const newEvents = incoming.filter((e) => !existingSeqs.has(e.seq));

  if (newEvents.length === 0) return existing;

  return [...existing, ...newEvents].sort((a, b) => a.seq - b.seq);
}

export function useExecutionStream(id: string, enabled = true): UseExecutionStreamReturn {
  const orgId = useCurrentOrgId();
  const [events, setEvents] = useState<ExecutionEventRecord[]>([]);
  const [lastSeq, setLastSeq] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [mode, setMode] = useState<'sse' | 'polling' | 'disconnected'>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const shouldFetch = enabled && !!id && isOrgIdValid(orgId);

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setEvents([]);
    setLastSeq(0);
    setError(null);
  }, [cleanup]);

  const startPolling = useCallback(
    (initialSeq: number) => {
      setMode('polling');
      let currentSeq = initialSeq;
      let stopped = false;

      const poll = async () => {
        if (stopped) return;
        try {
          const result = await fetchExecutionEvents(id, currentSeq);
          if (result.items.length > 0) {
            setEvents((prev) => mergeEvents(prev, result.items));
            const maxSeq = Math.max(...result.items.map((e) => e.seq));
            currentSeq = maxSeq;
            setLastSeq(maxSeq);
          }
        } catch (err) {
          console.error('[execution-stream] polling error:', err);
        }
      };

      poll();
      pollIntervalRef.current = setInterval(poll, 3000);

      cleanupRef.current = () => {
        stopped = true;
      };
    },
    [id]
  );

  const trySSE = useCallback(() => {
    try {
      const url = `/api/executions/${id}/stream?afterSeq=${lastSeq}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      let sseTimeout: ReturnType<typeof setTimeout>;
      const scheduleTimeout = () => {
        if (sseTimeout) clearTimeout(sseTimeout);
        sseTimeout = setTimeout(() => {
          console.warn('[execution-stream] SSE timeout, falling back to polling');
          es.close();
          eventSourceRef.current = null;
          startPolling(lastSeq);
        }, 10000);
      };

      es.onopen = () => {
        setIsConnected(true);
        setMode('sse');
        setError(null);
        scheduleTimeout();
      };

      es.addEventListener('event', (e: Event) => {
        if (sseTimeout) clearTimeout(sseTimeout);
        try {
          const data = JSON.parse((e as MessageEvent).data) as ExecutionEventRecord;
          setEvents((prev) => {
            const exists = prev.some((ev) => ev.seq === data.seq);
            if (exists) return prev;
            return [...prev, data].sort((a, b) => a.seq - b.seq);
          });
          setLastSeq(data.seq);
        } catch (err) {
          console.error('[execution-stream] SSE event parse error:', err);
        }
        scheduleTimeout();
      });

      es.addEventListener('heartbeat', () => {
        if (sseTimeout) clearTimeout(sseTimeout);
        scheduleTimeout();
      });

      es.addEventListener('done', () => {
        if (sseTimeout) clearTimeout(sseTimeout);
        es.close();
        eventSourceRef.current = null;
        setIsConnected(false);
        setMode('disconnected');
      });

      es.onerror = () => {
        if (sseTimeout) clearTimeout(sseTimeout);
        console.warn('[execution-stream] SSE error, falling back to polling');
        es.close();
        eventSourceRef.current = null;
        setIsConnected(false);
        setError(new Error('SSE connection failed'));
        startPolling(lastSeq);
      };
    } catch (err) {
      console.error('[execution-stream] SSE setup error:', err);
      setError(err instanceof Error ? err : new Error('SSE setup failed'));
      startPolling(lastSeq);
    }
  }, [id, lastSeq, startPolling]);

  useEffect(() => {
    if (!shouldFetch) {
      cleanup();
      return;
    }

    setEvents([]);
    setLastSeq(0);
    setError(null);

    trySSE();

    return cleanup;
  }, [shouldFetch, id, trySSE, cleanup]);

  return {
    events,
    lastSeq,
    isConnected,
    mode,
    error,
    reset,
  };
}
