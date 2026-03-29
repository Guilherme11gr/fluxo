import { useUpdateTask } from '@/lib/query/hooks/use-tasks';
import { useCurrentOrgId } from '@/lib/query/hooks/use-org-id';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/query-keys';
import { smartInvalidate } from '@/lib/query/helpers';
import { toast } from 'sonner';
import type { TasksResponse } from '@/lib/query/hooks/use-tasks';
import type { Task } from '@/shared/types/task.types';
import { getSession } from '@/lib/auth-client';

interface UseBlockTaskOptions {
  onSuccess?: (blocked: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook para bloquear/desbloquear tasks com optimistic updates
 * Implementa snapshot e rollback para UX fluida
 * 
 * @example
 * const { toggleBlocked, isPending } = useBlockTask(taskId);
 * 
 * // Bloquear com motivo
 * toggleBlocked(true, 'Aguardando aprovação do cliente');
 * 
 * // Desbloquear (motivo permanece no histórico)
 * toggleBlocked(false);
 */
export function useBlockTask(taskId: string, options?: UseBlockTaskOptions) {
  const { mutate, isPending } = useUpdateTask();
  const queryClient = useQueryClient();
  const orgId = useCurrentOrgId();

  const toggleBlocked = async (blocked: boolean, blockReason?: string) => {
    // Guard: Previne mutação se taskId estiver vazio
    if (!taskId) {
      console.warn('[useBlockTask] toggleBlocked chamado sem taskId válido');
      return;
    }

    // Validação: motivo obrigatório ao bloquear
    if (blocked && !blockReason) {
      console.error('[useBlockTask] blockReason é obrigatório ao bloquear uma task');
      toast.error('Motivo de bloqueio é obrigatório');
      return;
    }

    // Pegar userId atual para audit trail
    const session = await getSession();
    const userId = session.data?.user?.id;

    // 1. Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: queryKeys.tasks.lists(orgId) });

    // 2. Snapshot previous state (para rollback completo)
    const previousTasks = queryClient.getQueriesData({
      queryKey: queryKeys.tasks.lists(orgId)
    });

    // 3. Optimistically update UI (com blockedAt e blockedBy)
    const now = new Date();
    queryClient.setQueriesData(
      { queryKey: queryKeys.tasks.lists(orgId) },
      (old: TasksResponse | undefined) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((task) =>
            task.id === taskId 
              ? { 
                  ...task, 
                  blocked, 
                  blockReason: blocked ? blockReason : null, // ✅ null explícito ao desbloquear
                  blockedAt: blocked ? now : null,
                  blockedBy: blocked ? userId : null,
                } 
              : task
          ),
        };
      }
    );

    // 4. Execute mutation
    mutate(
      { 
        id: taskId, 
        data: { 
          blocked, 
          blockReason: blocked ? blockReason : null, // ✅ null explícito (não undefined)
          blockedAt: blocked ? now : null,
          blockedBy: blocked ? userId : null,
        } 
      },
      {
        onSuccess: () => {
          toast.success(blocked ? 'Task bloqueada' : 'Task desbloqueada');

          // Invalidate with smartInvalidate (UPDATE operation)
          smartInvalidate(queryClient, queryKeys.tasks.lists(orgId));
          smartInvalidate(queryClient, queryKeys.features.lists(orgId));
          smartInvalidate(queryClient, queryKeys.epics.lists(orgId));

          options?.onSuccess?.(blocked);
        },
        onError: (error) => {
          // ✅ Rollback completo: restaura estado anterior (inclui blockReason/blockedAt/blockedBy)
          previousTasks.forEach(([queryKey, data]) => {
            queryClient.setQueryData(queryKey, data);
          });
          toast.error('Erro ao atualizar task');
          console.error('Block task error:', error);
          options?.onError?.(error as Error);
        },
      }
    );
  };

  return {
    toggleBlocked,
    isPending,
  };
}
