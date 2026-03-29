'use client';

import { useEffect, useRef } from 'react';
import { useRealtimeManager } from '@/providers/realtime-provider';
import type { ConnectionManagerConfig, BroadcastEvent } from '@/lib/realtime/types';

/**
 * Hook for managing real-time connection to Supabase
 *
 * ✅ Now consumes shared RealtimeConnectionManager from Context
 * ✅ No more multiple instances
 * ✅ Allows custom event handlers per component
 *
 * @example
 * const { status, broadcast } = useRealtimeConnection({
 *   onEvent: (event) => console.log('Received:', event)
 * });
 */
export function useRealtimeConnection(config?: Partial<ConnectionManagerConfig>) {
  const { manager, status, broadcast } = useRealtimeManager();
  const configRef = useRef(config);

  // Keep config ref up-to-date
  useEffect(() => {
    configRef.current = config;
  });

  // Register custom event handler if provided
  useEffect(() => {
    if (!manager || !configRef.current?.onEvent) {
      return;
    }

    // TODO: ConnectionManager needs to support multiple event subscribers
    // For now, custom onEvent handlers should use useRealtimeSync instead
    console.warn(
      '[useRealtimeConnection] Custom onEvent handlers not yet supported.'
      + ' Use useRealtimeSync().registerEventCallback() instead.'
    );
  }, [manager]);

  /**
   * Get current connection status
   */
  const getConnectionStatus = () => {
    return manager?.getStatus() || 'disconnected';
  };

  /**
   * Get current tab ID
   */
  const getTabId = () => {
    return manager?.getTabId();
  };

  return {
    status,
    broadcast,
    getConnectionStatus,
    getTabId,
  };
}
