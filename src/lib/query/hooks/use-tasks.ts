import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { invalidateDashboardQueries, smartInvalidate } from '../helpers';
import { queryKeys } from '../query-keys';
import { CACHE_TIMES } from '../cache-config';
import { useCurrentOrgId, isOrgIdValid } from './use-org-id';
import { useRealtimeActive } from '@/hooks/use-realtime-status';
import { useRealtimeBroadcast } from '@/hooks/use-realtime-sync';
import { useAuth } from '@/hooks/use-auth';
import type { TaskWithReadableId, TaskStatus } from '@/shared/types';
import type { TaskFiltersState } from '@/components/features/tasks';
import { toast } from 'sonner';

// ============ Types ============

export interface TasksResponse {
  items: TaskWithReadableId[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface CreateTaskInput {
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  featureId: string;
  points: number | string | null;
  module?: string | null;
  modules?: string[];
  assigneeId?: string | null;
  projectId?: string;
}

interface UpdateTaskInput {
  id: string;
  data: Partial<{
    title: string;
    description: string;
    status: TaskStatus;
    priority: string;
    type: string;
    points: number | null;
    module: string | null;
    modules: string[];
    featureId: string;
    assigneeId: string | null;
    blocked: boolean;
    blockReason: string | null; // ✅ null explícito (não undefined)
    blockedAt: Date | null; // Timestamp do bloqueio
    blockedBy: string | null; // User ID que bloqueou
  }>;
}

// ============ Fetch Functions ============

/**
 * Fetch tasks from API with server-side filtering
 * 
 * IMPORTANT: All filtering happens on the server for accuracy.
 * The 'me' assigneeId must be resolved to actual userId before calling.
 */
async function fetchTasks(filters?: Partial<TaskFiltersState>): Promise<TasksResponse> {
  const params = new URLSearchParams();
  
  // Optimized for Kanban: fetch enough tasks, skip expensive count
  params.set('pageSize', '100');
  params.set('sortBy', 'createdAt');
  params.set('sortOrder', 'desc');
  params.set('skipCount', 'true'); // Signal to API to skip count query

  // Add filters to params (skip 'all' and empty values)
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      // Skip 'all', 'me' (handled by caller), empty strings, and undefined
      if (value && value !== 'all' && value !== 'me' && value !== '') {
        params.set(key, String(value));
      }
    });
  }

  const res = await fetch(`/api/tasks?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  const json = await res.json();
  return json.data;
}

/**
 * Fetch single task by ID
 * Used for selective cache updates in real-time events
 */
async function fetchTaskById(id: string): Promise<TaskWithReadableId> {
  const res = await fetch(`/api/tasks/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch task ${id}`);
  const json = await res.json();
  return json.data;
}

// Export for use in event processor
export { fetchTaskById };

async function createTask(data: CreateTaskInput): Promise<TaskWithReadableId> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create task');
  const json = await res.json();
  return json.data;
}

async function updateTask({ id, data }: UpdateTaskInput): Promise<TaskWithReadableId> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update task');
  const json = await res.json();
  return json.data;
}

async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete task');
}

// ============ Hooks ============

interface UseTasksOptions {
  filters?: Partial<TaskFiltersState>;
  /** Current user ID - required to resolve 'me' filter */
  currentUserId?: string;
}

/**
 * Fetch tasks with server-side filtering
 * 
 * IMPORTANT: Filters are sent to the API, not applied client-side.
 * This ensures accurate results even with >100 tasks.
 * 
 * Query keys include orgId for multi-org cache isolation.
 * 
 * @example
 * const { data, isLoading } = useTasks({ 
 *   filters: { status: 'DOING', assigneeId: 'me' },
 *   currentUserId: user.id 
 * });
 */
export function useTasks(options: UseTasksOptions = {}) {
  const { filters, currentUserId } = options;
  const orgId = useCurrentOrgId();
  
  // Resolve 'me' to actual userId for server-side filtering
  const resolvedFilters = filters ? {
    ...filters,
    // Convert 'me' to actual UUID, or undefined if user not loaded
    assigneeId: filters.assigneeId === 'me' 
      ? currentUserId 
      : filters.assigneeId,
  } : undefined;

  return useQuery({
    queryKey: queryKeys.tasks.list(orgId, resolvedFilters),
    queryFn: async () => {
      const start = performance.now();
      const result = await fetchTasks(resolvedFilters);
      const end = performance.now();
      console.log(`[Query] 🔍 fetchTasks took ${(end - start).toFixed(2)}ms`);
      return result;
    },
    // Don't fetch if 'me' filter is set but user isn't loaded yet
    // Also don't fetch if orgId is unknown (not authenticated yet)
    enabled: !(filters?.assigneeId === 'me' && !currentUserId) && isOrgIdValid(orgId),
    // Keep previous data visible while fetching new filter results
    // This prevents the UI from showing skeleton on every filter change
    placeholderData: keepPreviousData,
    // Cache tasks for 5s - short to ensure UI stays fresh after mutations
    // Trade-off: more requests vs better UX consistency
    ...CACHE_TIMES.FRESH,
  });
}

/**
 * Create a new task
 */
export function useCreateTask() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();

  return useMutation({
    mutationFn: createTask,
    onSuccess: (newTask) => {
      // 1. Optimistic update: add to any matching list immediately
      queryClient.setQueriesData<TasksResponse>(
        { queryKey: queryKeys.tasks.lists(orgId) },
        (old) => {
          if (!old) return old;
          // Add to beginning of list (newest first)
          return {
            ...old,
            items: [newTask, ...old.items],
            total: old.total + 1,
          };
        }
      );

      // 2. Only invalidate if real-time is disconnected
      // If RT is active, the broadcast will handle invalidation
      if (!isRealtimeActive) {
        smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));
        
        // 3. Invalidate feature detail to update task count
        if (newTask.featureId) {
          smartInvalidate(queryClient, queryKeys.features.detail(orgId, newTask.featureId));
        }

        // 4. Invalidate Dashboard using helper
        invalidateDashboardQueries(queryClient, orgId);
      }

      toast.success('Task criada com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao criar task');
    },
  });
}

/**
 * Update a task
 * Automatically invalidates task list cache on success.
 * 
 * @example
 * const { mutate } = useUpdateTask();
 * mutate({ id: 'uuid', data: { status: 'DONE' } });
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();
  const broadcast = useRealtimeBroadcast();
  const { user } = useAuth();
  const actorName = typeof user?.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim()
    : user?.email?.split('@')[0] || 'Unknown';

  return useMutation({
    mutationFn: updateTask,
    onSuccess: (updatedTask) => {
      // 1. Broadcast to other clients (ALWAYS, even if RT active)
      broadcast({
        eventId: crypto.randomUUID(),
        orgId,
        entityType: 'task',
        entityId: updatedTask.id,
        projectId: updatedTask.feature?.epic?.project?.id || updatedTask.projectId || 'unknown',
        featureId: updatedTask.featureId || undefined,
        epicId: updatedTask.feature?.epic?.id || undefined,
        eventType: 'updated',
        actorType: 'user',
        actorName,
        actorId: user?.id || 'system',
        timestamp: new Date().toISOString(),
      });

      // 2. Optimistic update: update task in all lists immediately
      queryClient.setQueriesData<TasksResponse>(
        { queryKey: queryKeys.tasks.lists(orgId) },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((task) =>
              task.id === updatedTask.id ? updatedTask : task
            ),
          };
        }
      );

      // 3. Only invalidate if real-time is disconnected
      // If RT is active, broadcast will handle invalidation
      if (!isRealtimeActive) {
        smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));

        // 4. Update feature detail if task belongs to a feature (for count updates)
        if (updatedTask.featureId) {
          smartInvalidate(queryClient, queryKeys.features.detail(orgId, updatedTask.featureId));
        }

        // 5. Invalidate Dashboard
        invalidateDashboardQueries(queryClient, orgId);
      }

      toast.success('Task atualizada');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar task');
      console.error('Update task error:', error);
    },
  });
}

/**
 * Delete a task
 * Automatically invalidates task list cache on success.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: deleteTask,
    onMutate: async (taskId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists(orgId) });

      // Snapshot previous data for rollback
      const previousTasks = queryClient.getQueriesData<TasksResponse>({ 
        queryKey: queryKeys.tasks.lists(orgId) 
      });

      // Optimistically remove from all lists
      queryClient.setQueriesData<TasksResponse>(
        { queryKey: queryKeys.tasks.lists(orgId) },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter(task => task.id !== taskId),
            total: Math.max(0, old.total - 1),
          };
        }
      );

      return { previousTasks };
    },
    onSuccess: () => {
      // Force immediate refetch to ensure consistency
      smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));

      // Invalidate Dashboard using helper
      invalidateDashboardQueries(queryClient, orgId);

      toast.success('Task excluída');
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error('Erro ao excluir task');
      console.error('Delete task error:', error);
    },
  });
}

/**
 * Move task to new status (optimistic update)
 * Updates UI immediately, reverts on error.
 * Uses dedicated /status endpoint to ensure only status is changed.
 */
export function useMoveTask() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();
  const broadcast = useRealtimeBroadcast();
  const { user } = useAuth();
  const actorName = typeof user?.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim()
    : user?.email?.split('@')[0] || 'Unknown';

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const res = await fetch(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to move task');
      const json = await res.json();
      return json.data as TaskWithReadableId;
    },

    // Optimistic update
    onMutate: async ({ id, status }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists(orgId) });

      // Snapshot previous value
      const previousTasks = queryClient.getQueriesData({ queryKey: queryKeys.tasks.lists(orgId) });

      // Optimistically update
      queryClient.setQueriesData(
        { queryKey: queryKeys.tasks.lists(orgId) },
        (old: TasksResponse | undefined) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((task) =>
              task.id === id ? { ...task, status } : task
            ),
          };
        }
      );

      return { previousTasks };
    },

    onError: (_err, _vars, context) => {
      // Revert on error
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error('Erro ao mover task');
    },

    onSuccess: (movedTask, { status }) => {
      // Broadcast to other clients
      broadcast({
        eventId: crypto.randomUUID(),
        orgId,
        entityType: 'task',
        entityId: movedTask.id,
        projectId: movedTask.feature?.epic?.project?.id || movedTask.projectId || 'unknown',
        featureId: movedTask.featureId || undefined,
        epicId: movedTask.feature?.epic?.id || undefined,
        eventType: 'status_changed',
        actorType: 'user',
        actorName,
        actorId: user?.id || 'system',
        timestamp: new Date().toISOString(),
        metadata: { newStatus: status },
      });
    },

    onSettled: () => {
      // Only invalidate if real-time is disconnected
      // If RT is active, broadcast will handle invalidation
      if (!isRealtimeActive) {
        smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));
        invalidateDashboardQueries(queryClient, orgId);
      }
    },
  });
}
