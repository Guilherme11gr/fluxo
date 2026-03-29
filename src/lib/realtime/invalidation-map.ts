/**
 * Query Key Invalidation Map
 * 
 * Maps broadcast events to TanStack Query invalidation patterns.
 * When an event occurs, we know exactly which queries to invalidate.
 */

import type { QueryKey } from '@tanstack/react-query';
import type { BroadcastEvent } from './types';

/**
 * Determine which query keys to invalidate based on an event
 * IMPORTANT: Keys MUST match queryKeys factory structure from @/lib/query/query-keys
 * 
 * Query keys follow pattern: ['org', orgId, entityType, 'list', filters] or ['org', orgId, entityType, 'detail', id]
 * We invalidate by PREFIX to catch all variations (different filters)
 */
export function getInvalidationKeys(event: BroadcastEvent): QueryKey[] {
  const keys: QueryKey[] = [];
  const orgPrefix = ['org', event.orgId]; // All keys start with ['org', orgId]

  // ✅ Granular invalidation based on eventType
  switch (event.eventType) {
    case 'created':
      // Creation: invalidate lists by prefix (catches all filter variations)
      keys.push([...orgPrefix, getListKey(event.entityType), 'list']);
      
      // Invalidate dashboard activity feed (new task = new activity)
      keys.push([...orgPrefix, 'dashboard', 'activity']);
      
      // Invalidate parent entities by prefix
      if (event.featureId) {
        keys.push([...orgPrefix, 'features', 'detail', event.featureId]);
      }
      if (event.epicId) {
        keys.push([...orgPrefix, 'epics', 'detail', event.epicId]);
      }
      break;

    case 'deleted':
      // Deletion: invalidate entity detail + lists
      keys.push([...orgPrefix, getListKey(event.entityType), 'detail', event.entityId]);
      keys.push([...orgPrefix, getListKey(event.entityType), 'list']);
      
      // Invalidate dashboard activity feed (deleted task = new activity)
      keys.push([...orgPrefix, 'dashboard', 'activity']);
      
      // Invalidate parent entities
      if (event.featureId) {
        keys.push([...orgPrefix, 'features', 'detail', event.featureId]);
      }
      if (event.epicId) {
        keys.push([...orgPrefix, 'epics', 'detail', event.epicId]);
      }
      break;

    case 'updated':
      // Update: invalidate entity + lists (título/conteúdo mudou, precisa aparecer nas listas)
      keys.push([...orgPrefix, getListKey(event.entityType), 'detail', event.entityId]);
      keys.push([...orgPrefix, getListKey(event.entityType), 'list']); // ✅ FIX: Invalidar lists também
      
      // Invalidate dashboard activity feed (updated task = new activity)
      keys.push([...orgPrefix, 'dashboard', 'activity']);
      
      if (event.featureId) {
        keys.push([...orgPrefix, 'features', 'detail', event.featureId]);
      }
      break;

    case 'status_changed':
      // Status change: invalidate entity + lists (Kanban columns)
      keys.push([...orgPrefix, getListKey(event.entityType), 'detail', event.entityId]);
      keys.push([...orgPrefix, getListKey(event.entityType), 'list']);
      
      // Invalidate dashboard activity feed (status change = new activity)
      keys.push([...orgPrefix, 'dashboard', 'activity']);
      
      // Invalidate parent feature
      if (event.featureId) {
        keys.push([...orgPrefix, 'features', 'detail', event.featureId]);
      }
      break;

    case 'commented':
      // Comment: invalidate task entity (will refetch with comments)
      keys.push([...orgPrefix, 'tasks', 'detail', event.entityId]);
      
      // Invalidate dashboard activity feed (new comment = new activity)
      keys.push([...orgPrefix, 'dashboard', 'activity']);
      break;
  }

  return keys;
}

function getListKey(entityType: BroadcastEvent['entityType']): string {
  const map = {
    task: 'tasks',
    feature: 'features',
    epic: 'epics',
    comment: 'comments',
    doc: 'docs',
    project: 'projects',
  };
  return map[entityType];
}

/**
 * Batch multiple events and deduplicate invalidation keys
 * Returns a set of unique keys to invalidate
 */
export function deduplicateInvalidationKeys(events: BroadcastEvent[]): Set<string> {
  const keySet = new Set<string>();

  for (const event of events) {
    const keys = getInvalidationKeys(event);
    for (const key of keys) {
      // Serialize query key to string for deduplication
      keySet.add(JSON.stringify(key));
    }
  }

  return keySet;
}
