'use client';

import { useRealtimeConnection } from './use-realtime-connection';

/**
 * Check if real-time connection is active
 * 
 * Used in mutation hooks to decide whether to skip invalidation
 * (because real-time will handle it) or perform invalidation
 * (when real-time is disconnected, fallback to manual invalidation)
 * 
 * @returns true if real-time is connected and active
 * 
 * @example
 * function useUpdateTask() {
 *   const isRealtimeActive = useRealtimeActive();
 *   const queryClient = useQueryClient();
 *   
 *   return useMutation({
 *     mutationFn: async (data) => { ... },
 *     onSuccess: () => {
 *       // Only invalidate if real-time is disconnected
 *       if (!isRealtimeActive) {
 *         queryClient.invalidateQueries({ queryKey: ['tasks'] });
 *       }
 *     },
 *   });
 * }
 */
export function useRealtimeStatus() {
  const { status } = useRealtimeConnection();
  
  return {
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    isDisconnected: status === 'disconnected',
    hasFailed: status === 'failed',
    status,
  };
}

/**
 * Shorthand hook for quick connection check
 * 
 * @example
 * function MyComponent() {
 *   const isRealtimeConnected = useRealtimeActive();
 *   return <div>{isRealtimeConnected ? 'Live' : 'Offline'}</div>;
 * }
 */
export function useRealtimeActive(): boolean {
  const { status } = useRealtimeConnection();
  return status === 'connected';
}
