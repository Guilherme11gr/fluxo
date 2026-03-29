/**
 * Real-time Event Processor
 *
 * Manages incoming broadcast events with smart cache updates:
 * - Selective fetch: Only refetch changed entity, not entire list
 * - Debounced event queue (150ms)
 * - Deduplication by eventId
 * - Sequence gap detection
 * - Batch invalidations when needed
 */

import { useQueryClient } from '@tanstack/react-query';
import { useState, useCallback, useRef, useEffect } from 'react';
import { getInvalidationKeys, deduplicateInvalidationKeys } from './invalidation-map';
import type { BroadcastEvent } from './types';
import { fetchTaskById, type TasksResponse } from '@/lib/query/hooks/use-tasks';
import { fetchFeatureById } from '@/lib/query/hooks/use-features';
import type { TaskWithReadableId } from '@/shared/types/task.types';

// Constants for memory management
const PROCESSED_EVENTS_TTL = 60 * 1000; // 1 minute
const MAX_PROCESSED_EVENTS = 500; // Smaller limit
const MAX_MUTATION_RETRIES = 10; // 2 seconds (10 * 200ms)

// Feature flag for smart updates (vs full invalidation)
const USE_SMART_UPDATES = true;

// Timeout adaptativo: produção precisa de mais tempo (serverless cold start + latência)
const SMART_UPDATE_TIMEOUT =
  typeof window !== 'undefined' && process.env.NODE_ENV === 'production'
    ? 3000  // Produção: 3s (serverless cold start + latência de rede)
    : 1000; // Dev: 1s (local mais rápido mas realista)

// Helper function for fetch with timeout (DRY principle)
async function fetchWithTimeout<T>(
  fetchFn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([fetchFn(), timeoutPromise]);
}

interface EventProcessorOptions {
  /** Debounce delay in ms (default: 300ms) */
  debounceDelay?: number;

  /** Optional callback for debugging */
  onEventsProcessed?: (events: BroadcastEvent[], keys: Set<string>) => void;
}

// Track processed events with timestamp for proper LRU cleanup
interface ProcessedEvent {
  eventId: string;
  timestamp: number;
}

export function useRealtimeEventProcessor(options?: EventProcessorOptions) {
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  // Event queue for batching
  const eventQueueRef = useRef<BroadcastEvent[]>([]);

  // Track processed event IDs for deduplication with timestamp
  const processedEventsRef = useRef<Map<string, ProcessedEvent>>(new Map());

  // Timer for debouncing
  const debounceTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Track last seen sequence number for gap detection
  const lastSequenceRef = useRef<Map<string, number>>(new Map());
  
  // ✅ Track retry counts to prevent infinite loops
  const retryCountRef = useRef<Map<string, number>>(new Map());

  const debounceDelay = options?.debounceDelay || 150; // ✅ 150ms = melhor UX

  /**
   * Detect gaps in sequence numbers
   * Returns list of entities with gaps
   */
  const detectSequenceGaps = useCallback((events: BroadcastEvent[]): string[] => {
    const gaps: string[] = [];

    for (const event of events) {
      const entityKey = `${event.entityType}:${event.entityId}`;
      const lastSequence = lastSequenceRef.current.get(entityKey);

      if (lastSequence && event.sequence > lastSequence + 1) {
        // Gap detected!
        gaps.push(`${entityKey} (missing ${lastSequence + 1} to ${event.sequence - 1})`);
      }
    }

    return gaps;
  }, []);

  /**
   * Process batch of events in queue
   */
  const processBatch = useCallback(async () => { // ✅ Tornar async
    if (eventQueueRef.current.length === 0) {
      return;
    }

    setIsProcessing(true);

    try {
      const startTime = performance.now(); // 🔍 Performance tracking
      const events = [...eventQueueRef.current];
      
      // Clear queue
      eventQueueRef.current = [];

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] ⏱️ Processing batch of ${events.length} events (started at ${startTime.toFixed(2)}ms)`);
      }

      // Deduplicate events by eventId - O(n) using Set instead of O(n²) filter+findIndex
      const seenEventIds = new Set<string>();
      const uniqueEvents: BroadcastEvent[] = [];

      for (const event of events) {
        if (!seenEventIds.has(event.eventId)) {
          seenEventIds.add(event.eventId);
          uniqueEvents.push(event);
        }
      }

      const dedupeTime = performance.now();
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] ⏱️ Deduplication took ${(dedupeTime - startTime).toFixed(2)}ms`);
      }

      // Detect sequence gaps
      const gaps = detectSequenceGaps(uniqueEvents);
      if (gaps.length > 0) {
        console.warn(`[Realtime] Detected ${gaps.length} sequence gaps`, gaps);
        // ✅ FIX: Trigger catch-up invalidation for entities with gaps
        // When events are missed or arrive out of order, we invalidate
        // the entity's queries to force a full refetch and resync
        const entitiesToSync = new Set<string>();
        for (const gap of gaps) {
          // Parse gap string: "task:abc123 (missing 123 to 456)"
          const match = gap.match(/^(\w+):[\w-]+/);
          if (match) {
            entitiesToSync.add(match[1]); // Add entity type (task, feature, etc.)
          }
        }

        // Invalidate queries for entities with gaps
        for (const event of uniqueEvents) {
          if (entitiesToSync.has(event.entityType)) {
            const eventKeys = getInvalidationKeys(event);
            for (const key of eventKeys) {
              queryClient.invalidateQueries({
                queryKey: key,
                refetchType: 'active',
              });
            }
          }
        }
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Realtime] 🔄 Synced ${gaps.length} entities with sequence gaps`);
        }
      }

      // Get all invalidation keys and deduplicate
      const keySet = deduplicateInvalidationKeys(uniqueEvents);

      const keysTime = performance.now();
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] ⏱️ Key generation took ${(keysTime - dedupeTime).toFixed(2)}ms`);

        const parsedKeys = Array.from(keySet).map(k => JSON.parse(k));
        console.log('[Realtime] Invalidating keys (expanded):', parsedKeys);
      }
      
      const invalidateStart = performance.now();
      
      if (USE_SMART_UPDATES) {
        // Smart update: Tenta fetch seletivo, mas com timeout
        // Se demorar muito, fallback para invalidação normal
        let updatedCount = 0;

        // Track only events that failed smart update (not entire batch)
        const failedEvents = new Set<string>();

        for (const event of uniqueEvents) {
          const entityType = event.entityType;
          const entityId = event.entityId;
          const eventKey = `${entityType}:${entityId}`;

          // Decide estratégia por tipo de evento
          switch (event.eventType) {
            case 'updated':
            case 'status_changed': {
              // Smart update: busca task/feature com timeout
              if (entityType === 'task') {
                try {
                  if (process.env.NODE_ENV !== 'production') {
                    console.log(`[Realtime] 🎯 Smart update: fetching task ${entityId} (timeout=${SMART_UPDATE_TIMEOUT}ms)`);
                  }

                  const updated = await fetchWithTimeout(
                    () => fetchTaskById(entityId),
                    SMART_UPDATE_TIMEOUT
                  );

                  // Update cache with fetched data
                  const listQueries = queryClient.getQueriesData<TasksResponse>({
                    queryKey: [event.orgId, 'tasks', 'list']
                  });

                  for (const [queryKey, data] of listQueries) {
                    if (data?.items) {
                      const index = data.items.findIndex(t => t.id === entityId);
                      if (index !== -1) {
                        const newItems = [...data.items];
                        newItems[index] = updated;
                        queryClient.setQueryData(queryKey, { ...data, items: newItems });
                        if (process.env.NODE_ENV !== 'production') {
                          console.log(`[Realtime] ✅ Updated task in cache`);
                        }
                        updatedCount++;
                      }
                    }
                  }

                  // Update parents (non-blocking)
                  if (event.featureId) {
                    queryClient.invalidateQueries({
                      queryKey: [event.orgId, 'features', 'detail', event.featureId],
                      refetchType: 'active',
                    });
                  }
                  if (event.epicId) {
                    queryClient.invalidateQueries({
                      queryKey: [event.orgId, 'epics', 'detail', event.epicId],
                      refetchType: 'active',
                    });
                  }

                } catch (error) {
                  if (process.env.NODE_ENV !== 'production') {
                    console.warn(`[Realtime] ⚠️ Smart update failed for task:${entityId} (${error}), will invalidate only this event`);
                  }
                  failedEvents.add(`task:${entityId}`);
                }
              } else if (entityType === 'feature') {
                try {
                  if (process.env.NODE_ENV !== 'production') {
                    console.log(`[Realtime] 🎯 Smart update: fetching feature ${entityId} (timeout=${SMART_UPDATE_TIMEOUT}ms)`);
                  }

                  const updated = await fetchWithTimeout(
                    () => fetchFeatureById(entityId),
                    SMART_UPDATE_TIMEOUT
                  );

                  // Feature
                  const listQueries = queryClient.getQueriesData({
                    queryKey: [event.orgId, 'features', 'list']
                  });

                  for (const [queryKey, data] of listQueries) {
                    if (Array.isArray(data)) {
                      const index = data.findIndex((f: { id: string }) => f.id === entityId);
                      if (index !== -1) {
                        const newData = [...data];
                        newData[index] = updated;
                        queryClient.setQueryData(queryKey, newData);
                        if (process.env.NODE_ENV !== 'production') {
                          console.log(`[Realtime] ✅ Updated feature in cache`);
                        }
                        updatedCount++;
                      }
                    }
                  }

                  // Update parents (non-blocking)
                  if (event.epicId) {
                    queryClient.invalidateQueries({
                      queryKey: [event.orgId, 'epics', 'detail', event.epicId],
                      refetchType: 'active',
                    });
                  }

                } catch (error) {
                  if (process.env.NODE_ENV !== 'production') {
                    console.warn(`[Realtime] ⚠️ Smart update failed for feature:${entityId} (${error}), will invalidate only this event`);
                  }
                  failedEvents.add(`feature:${entityId}`);
                }
              } else {
                // Other entity types: mark for normal invalidation
                failedEvents.add(eventKey);
              }
              break;
            }
            
            case 'created':
            case 'deleted': {
              // Esses precisam invalidar listas (item novo/removido muda total)
              // ✅ FIX: Only invalidate keys for THIS event, not entire keySet
              const eventKeys = getInvalidationKeys(event);
              for (const key of eventKeys) {
                queryClient.invalidateQueries({
                  queryKey: key,
                  refetchType: 'active',
                });
                updatedCount++;
              }
              break;
            }

            case 'commented': {
              // Invalida apenas query de comments da task
              queryClient.invalidateQueries({
                queryKey: [event.orgId, 'tasks', 'detail', entityId],
                refetchType: 'active',
              });
              updatedCount++;
              break;
            }
          }
        }

        // ✅ FIX: Invalidate ONLY failed events, not entire batch
        if (failedEvents.size > 0) {
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Realtime] ⚠️ Invalidating ${failedEvents.size} failed events individually`);
          }
          for (const eventKey of failedEvents) {
            const parts = eventKey.split(':');
            if (parts.length !== 2) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`[Realtime] Invalid eventKey format: ${eventKey}, skipping`);
              }
              continue;
            }
            const [entityType, entityId] = parts;
            const failedEvent = uniqueEvents.find(
              e => e.entityType === entityType && e.entityId === entityId
            );
            if (failedEvent) {
              const eventKeys = getInvalidationKeys(failedEvent);
              for (const key of eventKeys) {
                queryClient.invalidateQueries({
                  queryKey: key,
                  refetchType: 'active',
                });
              }
            }
          }
        }

        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Realtime] ⏱️ Smart updates: ${updatedCount} cache updates performed`);
        }
        
      } else {
        // ❌ FALLBACK: Invalidação tradicional (refetch tudo)
        for (const keyString of keySet) {
          const key = JSON.parse(keyString);
          queryClient.invalidateQueries({ 
            queryKey: key,
            refetchType: 'active',
          });
        }
      }
      
      const invalidateEnd = performance.now();
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] ⏱️ Invalidation took ${(invalidateEnd - invalidateStart).toFixed(2)}ms`);
        console.log(`[Realtime] ⏱️ TOTAL processing time: ${(invalidateEnd - startTime).toFixed(2)}ms`);
      }

      // Mark events as processed with timestamp
      const now = Date.now();
      for (const event of uniqueEvents) {
        processedEventsRef.current.set(event.eventId, {
          eventId: event.eventId,
          timestamp: now,
        });

        // Track last sequence per entity
        const entityKey = `${event.entityType}:${event.entityId}`;
        lastSequenceRef.current.set(entityKey, event.sequence);
      }

      // Cleanup old processed events using TTL + LRU
      if (processedEventsRef.current.size > MAX_PROCESSED_EVENTS) {
        const entries = Array.from(processedEventsRef.current.entries());
        
        // First: Remove events older than TTL
        for (const [eventId, { timestamp }] of entries) {
          if (now - timestamp > PROCESSED_EVENTS_TTL) {
            processedEventsRef.current.delete(eventId);
          }
        }
        
        // Second: If still above limit, remove oldest entries
        if (processedEventsRef.current.size > MAX_PROCESSED_EVENTS) {
          const sorted = Array.from(processedEventsRef.current.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
          
          const excessCount = sorted.length - MAX_PROCESSED_EVENTS;
          const toRemove = sorted.slice(0, excessCount);
          
          for (const [eventId] of toRemove) {
            processedEventsRef.current.delete(eventId);
          }
          
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[Realtime] Cleaned up ${toRemove.length} old events`);
          }
        }
      }

      // ✅ FIX: Cleanup lastSequenceRef to prevent unbounded growth
      const MAX_SEQUENCE_ENTRIES = 1000;
      if (lastSequenceRef.current.size > MAX_SEQUENCE_ENTRIES) {
        const sequenceEntries = Array.from(lastSequenceRef.current.entries());
        lastSequenceRef.current = new Map(sequenceEntries.slice(-500));
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Realtime] Cleaned up ${sequenceEntries.length - 500} old sequence entries`);
        }
      }

      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] Invalidated ${keySet.size} query keys`);
      }

      // Debug callback
      options?.onEventsProcessed?.(uniqueEvents, keySet);

    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Realtime] Failed to process event batch:', error);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [queryClient, options, detectSequenceGaps]);

  /**
   * Process a single broadcast event
   * Adds to queue and schedules debounced invalidation
   */
  const processEvent = useCallback((event: BroadcastEvent) => {
    // Dedup: ignore if we've already processed this event
    if (processedEventsRef.current.has(event.eventId)) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] Ignoring duplicate event: ${event.eventId}`);
      }
      return;
    }

    // ✅ Check for pending mutations to avoid race condition
    const hasPendingMutation = queryClient.isMutating({
      predicate: (mutation) => {
        const mutationKey = mutation.options.mutationKey as string[] | undefined;
        return mutationKey?.includes(event.entityId) ?? false;
      },
    }) > 0;
    
    if (hasPendingMutation) {
      const retries = retryCountRef.current.get(event.eventId) || 0;
      
      if (retries >= MAX_MUTATION_RETRIES) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[Realtime] Giving up on event ${event.eventId} after ${retries} retries`);
        }
        retryCountRef.current.delete(event.eventId);
        // ✅ FIX: Also cleanup any stale entries in retryCountRef
        if (retryCountRef.current.size > 100) {
          retryCountRef.current.clear();
        }
        // Process anyway - mutation might be stuck
        eventQueueRef.current.push(event);
        
        // Schedule batch processing
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        debounceTimerRef.current = setTimeout(() => processBatch(), debounceDelay);
        return;
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[Realtime] Delaying event ${event.eventId} - mutation pending (retry ${retries + 1}/${MAX_MUTATION_RETRIES})`);
      }
      retryCountRef.current.set(event.eventId, retries + 1);
      
      // ✅ Cancel existing debounce timer before retry
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = undefined;
      }
      
      setTimeout(() => processEvent(event), 200);
      return;
    }
    
    // ✅ Success: clear retry count
    retryCountRef.current.delete(event.eventId);

    // Add to queue
    eventQueueRef.current.push(event);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Schedule batch processing
    debounceTimerRef.current = setTimeout(() => {
      processBatch();
    }, debounceDelay);
  }, [debounceDelay, processBatch]);

  /**
   * Get statistics for debugging
   */
  const getStats = useCallback(() => {
    return {
      queueSize: eventQueueRef.current.length,
      processedCount: processedEventsRef.current.size,
      isProcessing,
    };
  }, [isProcessing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    processEvent,
    isProcessing,
    getStats,
  };
}
