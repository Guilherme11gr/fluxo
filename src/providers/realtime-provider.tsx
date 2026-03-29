'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { RealtimeConnectionManager } from '@/lib/realtime/connection-manager';
import type { ConnectionStatus, BroadcastEvent, ConnectionManagerConfig } from '@/lib/realtime/types';
import { useCurrentOrgId } from '@/lib/query/hooks/use-org-id';
import { useAuth } from '@/hooks/use-auth';
import { useRealtimeEventProcessor } from '@/lib/realtime/event-processor';
import { createClient } from '@/lib/supabase/client';

const MAX_QUEUED_BROADCASTS = 100;
const REALTIME_ENABLED = process.env.NEXT_PUBLIC_ENABLE_REALTIME === 'true';

interface RealtimeContextValue {
  manager: RealtimeConnectionManager | null;
  status: ConnectionStatus;
  broadcast: (event: Omit<BroadcastEvent, 'sequence' | 'tabId'>) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtimeManager() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error('useRealtimeManager must be used within RealtimeProvider');
  }
  return context;
}

function DisabledRealtimeProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<RealtimeContextValue>(() => ({
    manager: null,
    status: 'disconnected',
    broadcast: () => {},
  }), []);

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

function EnabledRealtimeProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const managerRef = useRef<RealtimeConnectionManager | null>(null);
  const queuedBroadcastsRef = useRef<Array<Omit<BroadcastEvent, 'sequence' | 'tabId'>>>([]);
  const orgId = useCurrentOrgId();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient() as never, []);

  const onEventsProcessed = useCallback((events: BroadcastEvent[], keys: Set<string>) => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[RealtimeProvider] Processed ${events.length} events, ${keys.size} keys`);
    }
  }, []);

  const { processEvent } = useRealtimeEventProcessor({
    onEventsProcessed,
  });

  const processEventRef = useRef(processEvent);
  useEffect(() => {
    processEventRef.current = processEvent;
  }, [processEvent]);

  useEffect(() => {
    if (!managerRef.current) {
      const onEvent = (event: BroadcastEvent) => {
        const receiveTime = Date.now();
        const eventTime = new Date(event.timestamp).getTime();
        const eventAge = receiveTime - eventTime;

        if (process.env.NODE_ENV !== 'production') {
          console.log(`[RealtimeProvider] Event received (age: ${eventAge.toFixed(0)}ms)`);
        }

        if (managerRef.current && event.tabId === managerRef.current.getTabId()) {
          return;
        }

        processEventRef.current(event);
      };

      const config: ConnectionManagerConfig = {
        onStatusChange: (newStatus: ConnectionStatus) => {
          setStatus(newStatus);
        },
        onEvent,
      };

      managerRef.current = new RealtimeConnectionManager(config, supabase);
    }

    return () => {
      if (managerRef.current) {
        managerRef.current.disconnect();
        managerRef.current = null;
      }
    };
  }, [supabase]);

  useEffect(() => {
    if (!orgId || !user?.id || !managerRef.current) {
      return;
    }

    managerRef.current.connect(orgId, user.id);

    return () => {
      if (managerRef.current) {
        managerRef.current.disconnect();
      }
    };
  }, [orgId, user?.id]);

  const broadcast = useCallback((event: Omit<BroadcastEvent, 'sequence' | 'tabId'>) => {
    if (!managerRef.current || status !== 'connected') {
      if (queuedBroadcastsRef.current.length >= MAX_QUEUED_BROADCASTS) {
        queuedBroadcastsRef.current.shift();
      }
      queuedBroadcastsRef.current.push(event);
      return;
    }

    if (queuedBroadcastsRef.current.length > 0) {
      const queued = queuedBroadcastsRef.current.splice(0);
      for (const queuedEvent of queued) {
        managerRef.current.broadcast(queuedEvent);
      }
    }

    managerRef.current.broadcast(event);
  }, [status]);

  const value: RealtimeContextValue = {
    manager: managerRef.current,
    status,
    broadcast,
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  if (!REALTIME_ENABLED) {
    return <DisabledRealtimeProvider>{children}</DisabledRealtimeProvider>;
  }

  return <EnabledRealtimeProvider>{children}</EnabledRealtimeProvider>;
}
