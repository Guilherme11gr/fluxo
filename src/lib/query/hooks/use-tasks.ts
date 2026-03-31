import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  nextCursor: string | null;
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
    blockReason: string | null;
    blockedAt: Date | null;
    blockedBy: string | null;
  }>;
}

// ============ Fetch Functions ============

function buildTaskParams(filters?: ResolvedFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all' && value !== 'me' && value !== '') {
        params.set(key, String(value));
      }
    });
  }

  return params;
}

async function fetchTasks(filters?: Partial<TaskFiltersState>): Promise<TasksResponse> {
  const params = buildTaskParams(filters);

  params.set('pageSize', '100');
  params.set('sortBy', 'createdAt');
  params.set('sortOrder', 'desc');
  params.set('skipCount', 'true');

  const res = await fetch(`/api/tasks?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  const json = await res.json();
  return json.data;
}

async function fetchTasksCursor(
  filters: Partial<TaskFiltersState> | undefined,
  cursor?: string
): Promise<TasksResponse> {
  const params = buildTaskParams(filters);

  params.set('pageSize', '20');
  params.set('sortBy', 'createdAt');
  params.set('sortOrder', 'desc');

  if (cursor) {
    params.set('cursor', cursor);
  }

  const res = await fetch(`/api/tasks?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  const json = await res.json();
  return json.data;
}

async function fetchTasksCount(filters?: Partial<TaskFiltersState>): Promise<number> {
  const params = buildTaskParams(filters);

  params.set('pageSize', '1');
  params.set('sortBy', 'createdAt');
  params.set('sortOrder', 'desc');

  const res = await fetch(`/api/tasks?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch tasks count');
  const json = await res.json();
  return json.data.total;
}

async function fetchTaskById(id: string): Promise<TaskWithReadableId> {
  const res = await fetch(`/api/tasks/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch task ${id}`);
  const json = await res.json();
  return json.data;
}

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

// ============ Helpers ============

type ResolvedFilters = Partial<TaskFiltersState> & { excludeStatuses?: string };

function resolveMeFilter(
  filters: Partial<TaskFiltersState> & { excludeStatuses?: string } | undefined,
  currentUserId?: string
): ResolvedFilters | undefined {
  if (!filters) return undefined;
  return {
    ...filters,
    assigneeId: filters.assigneeId === 'me' ? currentUserId : filters.assigneeId,
  };
}

// ============ Hooks ============

interface UseTasksOptions {
  filters?: Partial<TaskFiltersState> & { excludeStatuses?: string };
  currentUserId?: string;
}

export function useTasks(options: UseTasksOptions = {}) {
  const { filters, currentUserId } = options;
  const orgId = useCurrentOrgId();

  const resolvedFilters = resolveMeFilter(filters, currentUserId);

  return useQuery({
    queryKey: queryKeys.tasks.list(orgId, resolvedFilters),
    queryFn: async () => {
      const start = performance.now();
      const result = await fetchTasks(resolvedFilters);
      const end = performance.now();
      console.log(`[Query] fetchTasks took ${(end - start).toFixed(2)}ms`);
      return result;
    },
    enabled: !(filters?.assigneeId === 'me' && !currentUserId) && isOrgIdValid(orgId),
    placeholderData: keepPreviousData,
    ...CACHE_TIMES.FRESH,
  });
}

export function useInfiniteTasks(options: UseTasksOptions = {}) {
  const { filters, currentUserId } = options;
  const orgId = useCurrentOrgId();

  const resolvedFilters = resolveMeFilter(filters, currentUserId);

  return useInfiniteQuery({
    queryKey: queryKeys.tasks.list(orgId, resolvedFilters),
    queryFn: ({ pageParam }) => fetchTasksCursor(resolvedFilters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !(filters?.assigneeId === 'me' && !currentUserId) && isOrgIdValid(orgId),
    placeholderData: keepPreviousData,
    ...CACHE_TIMES.FRESH,
  });
}

export function useTasksCount(options: UseTasksOptions = {}) {
  const { filters, currentUserId } = options;
  const orgId = useCurrentOrgId();

  const resolvedFilters = resolveMeFilter(filters, currentUserId);

  return useQuery({
    queryKey: queryKeys.tasks.count(orgId, resolvedFilters),
    queryFn: () => fetchTasksCount(resolvedFilters),
    enabled: !(filters?.assigneeId === 'me' && !currentUserId) && isOrgIdValid(orgId),
    placeholderData: keepPreviousData,
    ...CACHE_TIMES.FRESH,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();

  return useMutation({
    mutationFn: createTask,
    onSuccess: (newTask) => {
      queryClient.setQueriesData<TasksResponse>(
        { queryKey: queryKeys.tasks.lists(orgId) },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            items: [newTask, ...old.items],
            total: old.total + 1,
          };
        }
      );

      if (!isRealtimeActive) {
        smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));
        if (newTask.featureId) {
          smartInvalidate(queryClient, queryKeys.features.detail(orgId, newTask.featureId));
        }
        invalidateDashboardQueries(queryClient, orgId);
      }

      toast.success('Task criada com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao criar task');
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();
  const broadcast = useRealtimeBroadcast();
  const { viewer } = useAuth();
  const actorName = viewer?.displayName?.trim() || 'Unknown';

  return useMutation({
    mutationFn: updateTask,
    onSuccess: (updatedTask) => {
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
        actorId: viewer?.id || 'system',
        timestamp: new Date().toISOString(),
      });

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

      if (!isRealtimeActive) {
        smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));
        if (updatedTask.featureId) {
          smartInvalidate(queryClient, queryKeys.features.detail(orgId, updatedTask.featureId));
        }
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

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: deleteTask,
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists(orgId) });

      const previousTasks = queryClient.getQueriesData<TasksResponse>({
        queryKey: queryKeys.tasks.lists(orgId)
      });

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
      smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));
      invalidateDashboardQueries(queryClient, orgId);
      toast.success('Task excluída');
    },
    onError: (error, _, context) => {
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

export function useMoveTask() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();
  const isRealtimeActive = useRealtimeActive();
  const broadcast = useRealtimeBroadcast();
  const { viewer } = useAuth();
  const actorName = viewer?.displayName?.trim() || 'Unknown';

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

    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists(orgId) });

      const previousTasks = queryClient.getQueriesData({ queryKey: queryKeys.tasks.lists(orgId) });

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
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error('Erro ao mover task');
    },

    onSuccess: (movedTask, { status }) => {
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
        actorId: viewer?.id || 'system',
        timestamp: new Date().toISOString(),
        metadata: { newStatus: status },
      });
    },

    onSettled: () => {
      if (!isRealtimeActive) {
        smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));
        invalidateDashboardQueries(queryClient, orgId);
      }
    },
  });
}
