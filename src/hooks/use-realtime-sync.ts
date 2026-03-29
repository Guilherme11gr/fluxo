'use client';

import React, { useCallback } from 'react';
import { useRealtimeManager } from '@/providers/realtime-provider';
import type { BroadcastEvent } from '@/lib/realtime/types';

/**
 * Main hook for real-time synchronization
 *
 * ✅ Now uses shared manager from Context
 * ✅ Simplified - event processing is handled by Provider
 *
 * @example
 * function App() {
 *   const { status, broadcast } = useRealtimeSync();
 *   return <div>{status}</div>;
 * }
 */
export function useRealtimeSync() {
  const { status, broadcast } = useRealtimeManager();
  const eventCallbacksRef = React.useRef<Set<(event: BroadcastEvent) => void>>(new Set());

  /**
   * Register a callback to be called when events are received
   * Returns an unsubscribe function
   */
  const registerEventCallback = useCallback((callback: (event: BroadcastEvent) => void) => {
    eventCallbacksRef.current.add(callback);

    return () => {
      eventCallbacksRef.current.delete(callback);
    };
  }, []);

  return {
    status,
    broadcast,
    registerEventCallback,
  };
}

/**
 * Hook to broadcast events to other clients
 * 
 * ✅ Now uses shared manager from Context
 * 
 * @example
 * function TaskUpdateForm() {
 *   const broadcast = useRealtimeBroadcast();
 *   const updateTask = useUpdateTask();
 *   
 *   const handleSubmit = async (data) => {
 *     await updateTask.mutateAsync(data);
 *     broadcast({
 *       eventId: crypto.randomUUID(),
 *       entityType: 'task',
 *       entityId: data.id,
 *       projectId: data.projectId,
 *       featureId: data.featureId,
 *       eventType: 'updated',
 *       actorType: 'user',
 *       actorName: 'John Doe',
 *       actorId: user.id,
 *       timestamp: new Date().toISOString(),
 *     });
 *   };
 * }
 */
export function useRealtimeBroadcast() {
  const { broadcast } = useRealtimeManager();

  return broadcast;
}

// Note: useRealtimeActive is exported from use-realtime-status.ts to avoid duplication
