/**
 * Supabase Broadcast Helper
 * 
 * Provides utilities for broadcasting real-time events via Supabase Channels.
 * This is used by API routes to notify other clients of entity changes.
 */

import { createClient } from './server';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Broadcast Event Types
 */
export type EntityType = 'task' | 'feature' | 'epic' | 'comment';
export type EventType = 'created' | 'updated' | 'deleted' | 'status_changed';
export type ActorType = 'user' | 'agent' | 'system';

/**
 * Broadcast Event Payload
 * Matches the expected format in ConnectionManager's onEvent handler
 */
export interface BroadcastEvent {
  eventId: string;
  sequence: number; // REQUIRED for deduplication and ordering
  entityType: EntityType;
  entityId: string;
  eventType: EventType;
  actorType: ActorType;
  actorName: string;
  actorId?: string;
  projectId: string;
  orgId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Broadcast an entity event to all clients in the organization
 * 
 * @param orgId - Organization ID
 * @param projectId - Project ID
 * @param eventType - Type of event (created, updated, deleted, status_changed)
 * @param entityType - Type of entity (task, feature, epic, comment)
 * @param entityId - Entity ID
 * @param actor - Actor information
 * @param metadata - Optional additional metadata
 * 
 * @example
 * await broadcastEntityEvent(
 *   orgId,
 *   projectId,
 *   'updated',
 *   'task',
 *   taskId,
 *   { type: 'user', name: 'John Doe' },
 *   { featureId, previousStatus, newStatus }
 * );
 */
export async function broadcastEntityEvent(
  orgId: string,
  projectId: string,
  eventType: EventType,
  entityType: EntityType,
  entityId: string,
  actor: { type: ActorType; name: string; id?: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient();
    if (typeof (supabase as { channel?: unknown }).channel !== 'function') {
      return;
    }

    // ✅ Sequence unificado: server e client usam Date.now()
    // Garante ordenação temporal e elimina sequence gaps nos logs
    const sequence = Date.now();

    const event: BroadcastEvent = {
      eventId: crypto.randomUUID(),
      sequence,
      entityType,
      entityId,
      eventType,
      actorType: actor.type,
      actorName: actor.name,
      actorId: actor.id,
      projectId,
      orgId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    console.log(`[Broadcast Server] 📤 Broadcasting ${entityType}:${eventType} with sequence=${sequence}`);

    // Create channel reference (doesn't subscribe, just used for sending)
    // Note: Supabase channels must be created fresh each time in server context
    const channel = (supabase as unknown as { channel: (name: string, opts?: Record<string, unknown>) => RealtimeChannel }).channel(`org:${orgId}`, {
      config: {
        broadcast: { self: false }, // Don't receive own events
      },
    });

    // Send broadcast event immediately (no subscription needed)
    channel.send({
      type: 'broadcast',
      event: 'entity_event',
      payload: event,
    });

    console.log(`[Broadcast] ${eventType.toUpperCase()} ${entityType}:${entityId} in org:${orgId} by ${actor.type}:${actor.name}`);
  } catch (error) {
    console.error('[Broadcast] Failed to emit event:', error);
    // Don't throw - broadcast failures shouldn't break the main operation
  }
}

/**
 * Broadcast multiple events in parallel
 * Useful when multiple entities are affected by a single operation
 * 
 * @example
 * await broadcastMultipleEvents(orgId, projectId, [
 *   { eventType: 'deleted', entityType: 'task', entityId: 'task-1' },
 *   { eventType: 'deleted', entityType: 'comment', entityId: 'comment-1' },
 * ]);
 */
export async function broadcastMultipleEvents(
  orgId: string,
  projectId: string,
  events: Array<{
    eventType: EventType;
    entityType: EntityType;
    entityId: string;
    actor: { type: ActorType; name: string; id?: string };
    metadata?: Record<string, unknown>;
  }>
): Promise<void> {
  await Promise.all(
    events.map((e) =>
      broadcastEntityEvent(
        orgId,
        projectId,
        e.eventType,
        e.entityType,
        e.entityId,
        e.actor,
        e.metadata
      )
    )
  );
}

/**
 * Convenience function for broadcasting task events
 */
export async function broadcastTaskEvent(
  orgId: string,
  projectId: string,
  eventType: EventType,
  taskId: string,
  actor: { type: ActorType; name: string; id?: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  return broadcastEntityEvent(
    orgId,
    projectId,
    eventType,
    'task',
    taskId,
    actor,
    metadata
  );
}

/**
 * Convenience function for broadcasting feature events
 */
export async function broadcastFeatureEvent(
  orgId: string,
  projectId: string,
  eventType: EventType,
  featureId: string,
  actor: { type: ActorType; name: string; id?: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  return broadcastEntityEvent(
    orgId,
    projectId,
    eventType,
    'feature',
    featureId,
    actor,
    metadata
  );
}

/**
 * Convenience function for broadcasting epic events
 */
export async function broadcastEpicEvent(
  orgId: string,
  projectId: string,
  eventType: EventType,
  epicId: string,
  actor: { type: ActorType; name: string; id?: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  return broadcastEntityEvent(
    orgId,
    projectId,
    eventType,
    'epic',
    epicId,
    actor,
    metadata
  );
}

/**
 * Convenience function for broadcasting comment events
 */
export async function broadcastCommentEvent(
  orgId: string,
  projectId: string,
  eventType: EventType,
  commentId: string,
  actor: { type: ActorType; name: string; id?: string },
  metadata?: Record<string, unknown>
): Promise<void> {
  return broadcastEntityEvent(
    orgId,
    projectId,
    eventType,
    'comment',
    commentId,
    actor,
    metadata
  );
}
