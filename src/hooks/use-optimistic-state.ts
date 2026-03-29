'use client';

/**
 * useOptimisticState Hook
 * 
 * Manages optimistic UI state for entities being mutated.
 * Returns a boolean indicating if an entity is in an optimistic state.
 * 
 * @example
 * const { isOptimistic, setOptimistic } = useOptimisticState();
 * 
 * // During mutation
 * setOptimistic(taskId, true);
 * 
 * // After mutation
 * setOptimistic(taskId, false);
 * 
 * @example with auto-reset
 * const { isOptimistic, setOptimisticWithReset } = useOptimisticState();
 * setOptimisticWithReset(taskId, true, 2000); // Auto-reset after 2s
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export function useOptimisticState() {
  const [optimisticEntities, setOptimisticEntities] = useState<Set<string>>(new Set());
  // Track active timeouts for cleanup
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all pending timeouts
      timeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutsRef.current.clear();
    };
  }, []);

  /**
   * Check if an entity is in optimistic state
   */
  const isOptimistic = useCallback((entityId: string) => {
    return optimisticEntities.has(entityId);
  }, [optimisticEntities]);

  /**
   * Set entity optimistic state
   */
  const setOptimistic = useCallback((entityId: string, state: boolean) => {
    setOptimisticEntities((prev) => {
      const next = new Set(prev);
      if (state) {
        next.add(entityId);
      } else {
        next.delete(entityId);
      }
      return next;
    });
  }, []);

  /**
   * Set optimistic state with auto-reset after delay
   * Useful for mutations that might take a while
   */
  const setOptimisticWithReset = useCallback(
    (entityId: string, state: boolean, resetDelay?: number) => {
      setOptimistic(entityId, state);

      if (state && resetDelay && resetDelay > 0) {
        // Clear any existing timeout for this entity
        const existingTimeout = timeoutsRef.current.get(entityId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
        }
        
        const timeoutId = setTimeout(() => {
          setOptimistic(entityId, false);
          timeoutsRef.current.delete(entityId);
        }, resetDelay);
        
        // Store timeout ID for cleanup
        timeoutsRef.current.set(entityId, timeoutId);
      } else if (!state) {
        // If state is being set to false, clear any pending reset
        const existingTimeout = timeoutsRef.current.get(entityId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          timeoutsRef.current.delete(entityId);
        }
      }
    },
    [setOptimistic]
  );

  /**
   * Clear all optimistic states
   */
  const clearAllOptimistic = useCallback(() => {
    setOptimisticEntities(new Set());
    // Clear all pending timeouts
    timeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    timeoutsRef.current.clear();
  }, []);

  return {
    isOptimistic,
    setOptimistic,
    setOptimisticWithReset,
    clearAllOptimistic,
  };
}
