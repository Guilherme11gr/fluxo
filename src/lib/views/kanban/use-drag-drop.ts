'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent as DndDragEndEvent,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import type { TaskStatus, TaskWithReadableId } from '@/shared/types';

interface UseDragDropOptions {
  tasks: TaskWithReadableId[];
  onDragEnd: (taskId: string, newStatus: TaskStatus) => Promise<void>;
}

interface UseDragDropReturn {
  DndContextProvider: typeof DndContext;
  DragOverlayComponent: typeof DragOverlay;
  sensors: ReturnType<typeof useSensors>;
  modifiers: typeof restrictToWindowEdges[];
  activeTask: TaskWithReadableId | null;
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DndDragEndEvent) => void;
  collisionDetection: typeof closestCenter;
}

export function useDragDrop({ tasks, onDragEnd }: UseDragDropOptions): UseDragDropReturn {
  const [activeTask, setActiveTask] = useState<TaskWithReadableId | null>(null);

  // ✅ FIX: Create Map for O(1) lookup instead of O(n) array.find()
  const tasksMap = useMemo(() =>
    new Map(tasks.map(t => [t.id, t])),
    [tasks]
  );

  // Sensors for mouse, touch and keyboard
  // Using Mouse/Touch instead of Pointer fixes issues with click propagation
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasksMap.get(String(event.active.id));
      if (task) {
        setActiveTask(task);
      }
    },
    [tasksMap]
  );

  const handleDragEnd = useCallback(
    async (event: DndDragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      if (!over || active.id === over.id) return;

      const taskId = active.id as string;
      const newStatus = over.id as TaskStatus;

      // Check if dropped on a valid column
      const validStatuses: TaskStatus[] = [
        'BACKLOG',
        'TODO',
        'DOING',
        'REVIEW',
        'QA_READY',
        'DONE',
      ];

      if (validStatuses.includes(newStatus)) {
        // Optimistic update happens in parent
        await onDragEnd(taskId, newStatus);
      }
    },
    [onDragEnd]
  );

  return {
    DndContextProvider: DndContext,
    DragOverlayComponent: DragOverlay,
    sensors,
    modifiers: [restrictToWindowEdges],
    activeTask,
    handleDragStart,
    handleDragEnd,
    collisionDetection: closestCenter,
  };
}
