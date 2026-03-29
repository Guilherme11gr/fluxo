'use client';


import { useCallback, useMemo } from 'react';
import { toast } from "sonner";
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { TaskCard, KanbanBoardSkeleton } from '@/components/features/tasks';
import { KanbanColumn } from './kanban-column';
import { useDragDrop } from './use-drag-drop';
import { KANBAN_COLUMNS, groupTasksByStatus } from './types';
import type { TaskStatus, TaskWithReadableId } from '@/shared/types';

interface KanbanBoardProps {
  tasks: TaskWithReadableId[];
  onTaskMove: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onTaskClick?: (task: TaskWithReadableId) => void;
  onEdit?: (task: TaskWithReadableId) => void;
  onDelete?: (task: TaskWithReadableId) => void;
  isLoading?: boolean;
}

export function KanbanBoard({
  tasks,
  onTaskMove,
  onTaskClick,
  onEdit,
  onDelete,
  isLoading = false,
}: KanbanBoardProps) {
  // Group by status - optimistic updates are handled by useMoveTask hook
  const tasksByStatus = useMemo(() => groupTasksByStatus(tasks), [tasks]);

  // ✅ FIX: Create Map for O(1) lookup instead of O(n) array.find()
  const tasksMap = useMemo(() =>
    new Map(tasks.map(t => [t.id, t])),
    [tasks]
  );

  // Handle drag end with validation
  const handleDragEnd = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      const task = tasksMap.get(taskId);
      if (!task || task.status === newStatus) return;

      // Validation: Prevent direct move from BACKLOG to DONE
      if (task.status === 'BACKLOG' && newStatus === 'DONE') {
        toast.error('Não é permitido mover tasks diretamente do Backlog para Done.');
        return;
      }

      // Delegate to parent - optimistic updates handled by useMoveTask
      try {
        await onTaskMove(taskId, newStatus);
      } catch (error) {
        // Error handling done by useMoveTask
        console.error('Failed to move task:', error);
      }
    },
    [tasksMap, onTaskMove]
  );

  const {
    sensors,
    activeTask,
    handleDragStart,
    handleDragEnd: dndHandleDragEnd,
    collisionDetection,
  } = useDragDrop({
    tasks,
    onDragEnd: handleDragEnd,
  });

  if (isLoading) {
    return <KanbanBoardSkeleton />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={[restrictToWindowEdges]}
      onDragStart={handleDragStart}
      onDragEnd={dndHandleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 max-w-full">
        {KANBAN_COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            onTaskClick={onTaskClick}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Drag overlay - renders in portal above everything */}
      <DragOverlay>
        {activeTask && (
          <div className="rotate-3 scale-105">
            <TaskCard task={activeTask} variant="kanban" isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
