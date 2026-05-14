/**
 * React Query Hooks for Comments
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateDashboardQueries, smartInvalidate, smartInvalidateImmediate } from '../helpers';
import { toast } from 'sonner';
import { queryKeys } from '../query-keys';
import { CACHE_TIMES } from '../cache-config';
import { useCurrentOrgId, isOrgIdValid } from './use-org-id';

// Types
export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  agentId?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    displayName: string | null;
    avatarUrl: string | null;
  };
  agent?: {
    id: string;
    name: string;
  };
}

interface CreateCommentInput {
  taskId: string;
  content: string;
}

interface UpdateCommentInput {
  id: string;
  content: string;
}

// API Functions
async function fetchComments(taskId: string): Promise<Comment[]> {
  const res = await fetch(`/api/tasks/${taskId}/comments`);
  if (!res.ok) throw new Error('Failed to fetch comments');
  const json = await res.json();
  return json.data || [];
}

async function createComment(input: CreateCommentInput): Promise<Comment> {
  const res = await fetch(`/api/tasks/${input.taskId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: input.content }),
  });
  if (!res.ok) throw new Error('Failed to create comment');
  const json = await res.json();
  return json.data;
}

async function updateComment(input: UpdateCommentInput): Promise<Comment> {
  const res = await fetch(`/api/comments/${input.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: input.content }),
  });
  if (!res.ok) throw new Error('Failed to update comment');
  const json = await res.json();
  return json.data;
}

async function deleteComment(id: string): Promise<void> {
  const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete comment');
}

// ============ Hooks ============

/**
 * Fetch comments for a task
 */
export function useComments(taskId: string) {
  const orgId = useCurrentOrgId();
  
  return useQuery({
    queryKey: queryKeys.comments.list(orgId, taskId),
    queryFn: () => fetchComments(taskId),
    enabled: Boolean(taskId) && isOrgIdValid(orgId),
    ...CACHE_TIMES.FRESH, // Comments should be fresh
  });
}

/**
 * Add a comment to a task
 */
/**
 * Add a comment to a task
 */
export function useAddComment() {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: createComment,
    onSuccess: (newComment, variables) => {
      // 1. Update the list
      queryClient.setQueryData<Comment[]>(queryKeys.comments.list(orgId, variables.taskId), (old) => {
        if (!old) return [newComment];
        return [...old, newComment];
      });

      // 2. Invalidate (CREATE = critical)
      smartInvalidateImmediate(queryClient, queryKeys.comments.list(orgId, variables.taskId));
      invalidateDashboardQueries(queryClient, orgId);

      toast.success('Comentário adicionado');
    },
    onError: () => {
      toast.error('Erro ao adicionar comentário');
    },
  });
}

/**
 * Update a comment
 */
export function useUpdateComment(taskId: string) {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: updateComment,
    onSuccess: (updatedComment) => {
      // 1. Optimistic update: update in list immediately
      queryClient.setQueryData<Comment[]>(
        queryKeys.comments.list(orgId, taskId),
        (old) => {
          if (!old) return old;
          return old.map((c) => (c.id === updatedComment.id ? updatedComment : c));
        }
      );

      // 2. Invalidate for consistency (UPDATE)
      smartInvalidate(queryClient, queryKeys.comments.list(orgId, taskId));
      toast.success('Comentário atualizado');
    },
    onError: () => {
      toast.error('Erro ao atualizar comentário');
    },
  });
}

/**
 * Delete a comment
 */
export function useDeleteComment(taskId: string) {
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  return useMutation({
    mutationFn: deleteComment,
    onMutate: async (deletedId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.comments.list(orgId, taskId) });

      // Snapshot previous value
      const previousComments = queryClient.getQueryData<Comment[]>(
        queryKeys.comments.list(orgId, taskId)
      );

      // Optimistically remove
      if (previousComments) {
        queryClient.setQueryData<Comment[]>(
          queryKeys.comments.list(orgId, taskId),
          previousComments.filter((c) => c.id !== deletedId)
        );
      }

      return { previousComments };
    },
    onSuccess: () => {
      smartInvalidateImmediate(queryClient, queryKeys.comments.list(orgId, taskId));
      invalidateDashboardQueries(queryClient, orgId);
      toast.success('Comentário excluído');
    },
    onError: (_, __, context) => {
      // Rollback on error
      if (context?.previousComments) {
        queryClient.setQueryData(
          queryKeys.comments.list(orgId, taskId),
          context.previousComments
        );
      }
      toast.error('Erro ao excluir comentário');
    },
  });
}
