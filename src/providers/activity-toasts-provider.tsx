'use client';

/**
 * ActivityToastsProvider
 * 
 * Connects real-time events to toast notifications.
 * Shows toasts when other users make changes.
 */

import { useEffect } from 'react';
import { useRealtimeSync } from '@/hooks/use-realtime-sync';
import { useActivityToasts } from '@/hooks/use-activity-toasts';
import type { BroadcastEvent } from '@/lib/realtime/types';
import { useAuth } from '@/hooks/use-auth';

interface ActivityToastsProviderProps {
  children: React.ReactNode;
}

export function ActivityToastsProvider({ children }: ActivityToastsProviderProps) {
  const { user } = useAuth();
  const currentUserId = user?.id;

  // Subscribe to RT events (just to get the registerEventCallback function)
  const { registerEventCallback } = useRealtimeSync();

  // Set up activity toasts with current user ID to filter own events
  const { triggerActivity } = useActivityToasts({
    currentUserId,
    showToasts: true,
  });

  useEffect(() => {
    const unsubscribe = registerEventCallback((broadcastEvent: BroadcastEvent) => {
      // Only show toasts for mutation events (created, updated, deleted)
      if (
!['created', 'updated', 'deleted'].includes(broadcastEvent.eventType)
) {
        return;
      }

      // Only show for tasks, features, and epics
      const entityType = broadcastEvent.entityType;
      if (
        entityType !== 'task' &&
        entityType !== 'feature' &&
        entityType !== 'epic'
      ) {
        return;
      }

      // Convert BroadcastEvent to ActivityEvent
      // Map 'created' -> 'create', 'updated' -> 'update', 'deleted' -> 'delete'
      const eventTypeMap: Record<string, 'create' | 'update' | 'delete'> = {
        'created': 'create',
        'updated': 'update',
        'deleted': 'delete',
      };

      const activityEvent = {
        entityId: broadcastEvent.entityId,
        entityType: entityType as 'task' | 'feature' | 'epic',
        eventType: eventTypeMap[broadcastEvent.eventType],
        data: broadcastEvent.metadata,
        updatedBy: broadcastEvent.actorId,
        updatedAt: broadcastEvent.timestamp,
      };

      // Trigger activity toast
      triggerActivity(activityEvent);
    });

    return () => {
      unsubscribe();
    };
  }, [registerEventCallback, triggerActivity]);

  return <>{children}</>;
}
