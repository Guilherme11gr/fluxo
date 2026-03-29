'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { smartInvalidate, smartInvalidateImmediate } from '../helpers';
import { CACHE_TIMES } from '../cache-config';
import type { TaskTag, TaskTagWithCounts, TagInfo, CreateTaskTagInput, UpdateTaskTagInput } from '@/shared/types/tag.types';

// ==================== Types ====================

interface ApiResponse<T> {
  data: T;
}

// ==================== Query Keys ====================

export const taskTagKeys = {
  all: ['taskTags'] as const,
  byProject: (projectId: string) => [...taskTagKeys.all, 'project', projectId] as const,
  byTask: (taskId: string) => [...taskTagKeys.all, 'task', taskId] as const,
};

// ==================== Hooks ====================

/**
 * Get all task tags for a project
 */
export function useTaskTags(projectId: string | undefined) {
  return useQuery<TaskTagWithCounts[]>({
    queryKey: taskTagKeys.byProject(projectId ?? ''),
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/projects/${projectId}/task-tags`);
      if (!res.ok) throw new Error('Failed to fetch tags');
      const json: ApiResponse<TaskTagWithCounts[]> = await res.json();
      return json.data;
    },
    enabled: !!projectId,
    ...CACHE_TIMES.STANDARD,
  });
}

/**
 * Get tags assigned to a specific task
 */
export function useTaskTagsForTask(taskId: string | undefined) {
  return useQuery<TagInfo[]>({
    queryKey: taskTagKeys.byTask(taskId ?? ''),
    queryFn: async () => {
      if (!taskId) return [];
      const res = await fetch(`/api/tasks/${taskId}/tags`);
      if (!res.ok) throw new Error('Failed to fetch task tags');
      const json: ApiResponse<TagInfo[]> = await res.json();
      return json.data;
    },
    enabled: !!taskId,
    ...CACHE_TIMES.FRESH,
  });
}

/**
 * Create a new tag in a project
 */
export function useCreateTaskTag(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<CreateTaskTagInput, 'projectId'>) => {
      const res = await fetch(`/api/projects/${projectId}/task-tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to create tag');
      }
      const json: ApiResponse<TaskTag> = await res.json();
      return json.data;
    },
    onSuccess: () => {
      smartInvalidateImmediate(queryClient, taskTagKeys.byProject(projectId));
    },
  });
}

/**
 * Update an existing tag
 */
export function useUpdateTaskTag(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...input }: UpdateTaskTagInput & { id: string }) => {
      const res = await fetch(`/api/projects/${projectId}/task-tags/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to update tag');
      }
      const json: ApiResponse<TaskTag> = await res.json();
      return json.data;
    },
    onSuccess: () => {
      smartInvalidate(queryClient, taskTagKeys.byProject(projectId));
    },
  });
}

/**
 * Delete a tag
 */
export function useDeleteTaskTag(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tagId: string) => {
      const res = await fetch(`/api/projects/${projectId}/task-tags/${tagId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to delete tag');
      }
    },
    onSuccess: () => {
      smartInvalidateImmediate(queryClient, taskTagKeys.byProject(projectId));
      // Also invalidate all task tags since they may have lost assignments
      smartInvalidateImmediate(queryClient, taskTagKeys.all);
    },
  });
}

/**
 * Assign tags to a task (replace all)
 */
export function useAssignTaskTags() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, tagIds }: { taskId: string; tagIds: string[] }) => {
      const res = await fetch(`/api/tasks/${taskId}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'Failed to assign tags');
      }
      const json: ApiResponse<TagInfo[]> = await res.json();
      return json.data;
    },
    onSuccess: (_, { taskId }) => {
      smartInvalidate(queryClient, taskTagKeys.byTask(taskId));
      // Also invalidate tasks list to refresh tag counts
      smartInvalidate(queryClient, ['tasks']);
    },
  });
}
