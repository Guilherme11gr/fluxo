/**
 * Real-time Types
 * 
 * Shared types for WebSocket communication and event processing.
 */

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface BroadcastEvent {
  /** Unique identifier for this event (UUID) */
  eventId: string;

  /** Monotonically increasing sequence number for ordering */
  sequence: number;

  /** Tab ID - identifies which tab/client originated the event */
  tabId: string;

  /** Organization ID - critical for multi-org isolation */
  orgId: string;

  /** Type of entity that was affected */
  entityType: 'task' | 'feature' | 'epic' | 'comment' | 'doc' | 'project';

  /** ID of the entity that was affected */
  entityId: string;

  /** Project ID (for filtering) */
  projectId: string;

  /** Feature ID (if applicable) */
  featureId?: string;

  /** Epic ID (if applicable) */
  epicId?: string;

  /** Type of event that occurred */
  eventType: 'created' | 'updated' | 'deleted' | 'status_changed' | 'commented';

  /** Type of actor that triggered the event */
  actorType: 'user' | 'agent' | 'system';

  /** Name of the actor (for display) */
  actorName: string;

  /** ID of the actor (user ID or agent ID) */
  actorId: string;

  /** ISO timestamp when the event occurred */
  timestamp: string;

  /** Additional metadata (optional) */
  metadata?: Record<string, unknown>;
}

export interface ConnectionManagerConfig {
  /** Callback when connection status changes */
  onStatusChange: (status: ConnectionStatus) => void;
  
  /** Callback when broadcast event is received */
  onEvent: (event: BroadcastEvent) => void;
  
  /** Optional: custom tab ID (defaults to generated UUID) */
  tabId?: string;
}

export interface SyncState {
  /** Organization ID */
  orgId: string;
  
  /** Last sequence number received */
  lastSequence: number;
  
  /** When the last sync happened */
  lastSyncAt: string;
  
  /** Pending mutations that haven't been synced yet */
  pendingMutations: PendingMutation[];
}

export interface PendingMutation {
  /** Unique identifier for this mutation */
  id: string;
  
  /** Entity type */
  entityType: string;
  
  /** Entity ID */
  entityId: string;
  
  /** Mutation data (what changed) */
  data: Record<string, unknown>;
  
  /** When the mutation was queued */
  queuedAt: string;
}
