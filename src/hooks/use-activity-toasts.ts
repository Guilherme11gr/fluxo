'use client';

/**
 * useActivityToasts Hook
 * 
 * Shows toast notifications when entities are updated via real-time events.
 * Provides feedback for external changes from other users.
 * 
 * @example
 * useActivityToasts({
 *   onTaskUpdate: (event) => showToast(`Task ${event.data.title} updated`)\ * });
 * 
 * @example with filtering
 * useActivityToasts({
 *   onTaskUpdate: (event) => {
 *     // Only show if updated by another user
 *     if (event.updatedBy !== currentUserId) {\ *       showToast(`Task updated by ${event.updatedBy}`)\ *     }\ *   }
 * });
 */

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface ActivityEvent {
  entityId: string;
  entityType: 'task' | 'feature' | 'epic';
  eventType: 'create' | 'update' | 'delete' | 'move';
  data: unknown;
  updatedBy?: string;
  updatedAt: string;
}

export interface UseActivityToastsOptions {
  /** Callback for task events */
  onTaskUpdate?: (event: ActivityEvent) => void;
  /** Callback for feature events */
  onFeatureUpdate?: (event: ActivityEvent) => void;
  /** Callback for epic events */
  onEpicUpdate?: (event: ActivityEvent) => void;
  /** Current user ID to filter own events */
  currentUserId?: string;
  /** Whether to show toasts automatically */
  showToasts?: boolean;
}

/**
 * Default toast messages for common events
 */
const DEFAULT_TOASTS = {
  task: {
    create: 'Nova tarefa criada',
    update: 'Tarefa atualizada',
    delete: 'Tarefa excluída',
    move: 'Tarefa movida',
  },
  feature: {
    create: 'Nova feature criada',
    update: 'Feature atualizada',
    delete: 'Feature excluída',
  },
  epic: {
    create: 'Novo epic criado',
    update: 'Epic atualizado',
    delete: 'Epic excluído',
  },
};

/**
 * Hook for showing activity toast notifications
 */
export function useActivityToasts(options: UseActivityToastsOptions = {}) {
  const {
    onTaskUpdate,
    onFeatureUpdate,
    onEpicUpdate,
    currentUserId,
    showToasts = true,
  } = options;

  // Track active toasts to prevent spam (max 3 visible)
  const activeToasts = useRef<Set<string>>(new Set());

  /**
   * Handle activity event and show toast if applicable
   */
  const handleActivity = useCallback(
    (event: ActivityEvent) => {
      // Filter out own events if currentUserId is provided
      if (currentUserId && event.updatedBy === currentUserId) {
        return;
      }

      // Call custom callback if provided
      switch (event.entityType) {
        case 'task':
          onTaskUpdate?.(event);
          break;
        case 'feature':
          onFeatureUpdate?.(event);
          break;
        case 'epic':
          onEpicUpdate?.(event);
          break;
      }

      // Show default toast if enabled and no custom callback
      if (showToasts && !onTaskUpdate && !onFeatureUpdate && !onEpicUpdate) {
        // Prevent toast spam - max 3 visible toasts
        const toastId = `${event.entityType}-${event.entityId}-${event.eventType}`;
        if (activeToasts.current.has(toastId)) {
          return;
        }

        try {
          // Get messages for this entity type
          const entityMessages = DEFAULT_TOASTS[event.entityType] as Record<string, string>;
          const message = entityMessages[event.eventType] || 'Atualização recebida';
          
          activeToasts.current.add(toastId);
          toast.success(message, {
            id: toastId,
            duration: 3000,
            onDismiss: () => {
              activeToasts.current.delete(toastId);
            },
          });
        } catch (error) {
          console.error('[ActivityToasts] Error showing toast:', error);
          // Silently fail - don't crash the app
        }
      }
    },
    [currentUserId, onTaskUpdate, onFeatureUpdate, onEpicUpdate, showToasts]
  );

  /**
   * Manually trigger an activity event (for testing or custom scenarios)
   */
  const triggerActivity = useCallback(
    (event: ActivityEvent) => {
      handleActivity(event);
    },
    [handleActivity]
  );

  return {
    triggerActivity,
  };
}
