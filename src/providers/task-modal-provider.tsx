'use client';

import { createContext, useContext, useState, useCallback, useMemo, useEffect, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TaskDetailModal } from '@/components/features/tasks/task-detail-modal';
import { TaskDialog } from '@/components/features/tasks';
import { useAllFeatures } from '@/lib/query';
import type { TaskWithReadableId } from '@/shared/types';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { queryKeys } from '@/lib/query/query-keys';
import type { TasksResponse } from '@/lib/query/hooks/use-tasks';

interface TaskModalContextValue {
  /** Abre a modal com uma task */
  openTask: (task: TaskWithReadableId) => void;
  /** Abre a modal buscando task por ID */
  openTaskById: (taskId: string) => void;
  /** Fecha a modal */
  closeTask: () => void;
  /** Abre modal de edição */
  openEditModal: (task: TaskWithReadableId) => void;
  /** Fecha modal de edição */
  closeEditModal: () => void;
  /** Task atualmente aberta */
  currentTask: TaskWithReadableId | null;
  /** Task sendo editada */
  editingTask: TaskWithReadableId | null;
  /** Se a modal está aberta */
  isOpen: boolean;
  /** Se modal de edição está aberta */
  isEditModalOpen: boolean;
}

const TaskModalContext = createContext<TaskModalContextValue | undefined>(undefined);

export function useTaskModal() {
  const context = useContext(TaskModalContext);
  if (!context) {
    throw new Error('useTaskModal must be used within TaskModalProvider');
  }
  return context;
}

interface TaskModalProviderProps {
  children: React.ReactNode;
}

/**
 * TaskModalProviderInner - Componente interno que usa useSearchParams
 */
function TaskModalProviderInner({ children }: TaskModalProviderProps) {
  const [currentTask, setCurrentTask] = useState<TaskWithReadableId | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithReadableId | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Load features for TaskDialog
  const { data: allFeatures = [] } = useAllFeatures();

  // 🔄 Subscribe to specific task list cache changes to keep modal in sync
  useEffect(() => {
    if (!currentTask?.id || !isOpen) return;

    const taskId = currentTask.id;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // Only react to updates on tasks queries
      if (event.type !== 'updated' || event.query.queryKey[0] !== 'tasks') return;

      // Efficiently find the updated task in the specific query that changed
      const data = event.query.state.data as TasksResponse | undefined;
      // Skip infinite query data (different shape: { pages, pageParams })
      if (data && !('items' in data)) return;
      const updatedTask = data?.items?.find((t) => t.id === taskId);
      
      if (updatedTask) {
        // Update modal with fresh data from cache
        setCurrentTask(updatedTask);
      }
    });

    return () => unsubscribe();
  }, [currentTask?.id, isOpen, queryClient]);

  // Abre modal com task já carregada
  const openTask = useCallback((task: TaskWithReadableId) => {
    setCurrentTask(task);
    setIsOpen(true);
    
    // Atualiza URL sem navegar
    const params = new URLSearchParams(searchParams.toString());
    params.set('task', task.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  // Abre modal por ID (precisa buscar task)
  const openTaskById = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`);
      if (response.ok) {
        const { data } = await response.json();
        setCurrentTask(data);
        setIsOpen(true);
        
        const params = new URLSearchParams(searchParams.toString());
        params.set('task', taskId);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    } catch (error) {
      console.error('Failed to fetch task:', error);
    }
  }, [pathname, router, searchParams]);

  // Fecha modal e limpa URL
  const closeTask = useCallback(() => {
    setIsOpen(false);
    setCurrentTask(null);
    
    // Remove task da URL
    const params = new URLSearchParams(searchParams.toString());
    params.delete('task');
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [pathname, router, searchParams]);

  // Abre modal de edição
  const openEditModal = useCallback((task: TaskWithReadableId) => {
    setEditingTask(task);
    setIsEditModalOpen(true);
    // Fecha modal de detalhes se estiver aberta
    setIsOpen(false);
  }, []);

  // Fecha modal de edição
  const closeEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    setEditingTask(null);
  }, []);

  // Handler para editar (abre modal de edição)
  const handleEdit = useCallback((task: TaskWithReadableId) => {
    openEditModal(task);
  }, [openEditModal]);

  // Handler para deletar (placeholder - pode implementar depois)
  const handleDelete = useCallback((task: TaskWithReadableId) => {
    // TODO: Implementar delete com confirmação
    console.log('Delete task:', task.id);
  }, []);

  const value = useMemo(() => ({
    openTask,
    openTaskById,
    closeTask,
    openEditModal,
    closeEditModal,
    currentTask,
    editingTask,
    isOpen,
    isEditModalOpen,
  }), [openTask, openTaskById, closeTask, openEditModal, closeEditModal, currentTask, editingTask, isOpen, isEditModalOpen]);

  return (
    <TaskModalContext.Provider value={value}>
      {children}
      
      {/* Modal de detalhes - renderizada uma vez, controlada pelo context */}
      <TaskDetailModal
        task={currentTask}
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) closeTask();
        }}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      {/* Modal de edição/criação - global */}
      <TaskDialog
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        features={allFeatures}
        taskToEdit={editingTask ? {
          id: editingTask.id,
          title: editingTask.title,
          description: editingTask.description || '',
          type: editingTask.type,
          priority: editingTask.priority,
          status: editingTask.status,
          featureId: editingTask.feature?.id || '',
          points: editingTask.points?.toString() || null,
          modules: editingTask.modules || [],
          assigneeId: editingTask.assigneeId || null,
          tags: editingTask.tags || [],
        } : null}
        onSuccess={() => {
          closeEditModal();
          // Reabrir modal de detalhes se a task foi editada
          if (editingTask) {
            // Refetch task atualizada
            setTimeout(() => {
              if (editingTask.id) {
                openTaskById(editingTask.id);
              }
            }, 100);
          }
        }}
      />
    </TaskModalContext.Provider>
  );
}

/**
 * TaskModalProvider - Provider global para modal de task
 * 
 * Permite abrir a modal de detalhes de task de qualquer lugar do app.
 * Sincroniza com URL via query param ?task=uuid
 * 
 * Wrapped em Suspense para suportar useSearchParams no Next.js 14+
 */
export function TaskModalProvider({ children }: TaskModalProviderProps) {
  return (
    <Suspense fallback={children}>
      <TaskModalProviderInner>{children}</TaskModalProviderInner>
    </Suspense>
  );
}
