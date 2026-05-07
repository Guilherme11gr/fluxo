'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
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
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { Plus, Kanban as KanbanIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PersonalBoardColumn } from './personal-board-column';
import { PersonalBoardCard } from './personal-board-card';
import { PersonalBoardItemModal } from './personal-board-item-modal';
import { PersonalBoardDetailModal } from './personal-board-detail-modal';
import { PersonalBoardLinkTaskModal } from './personal-board-link-task-modal';
import type { PersonalBoardColumn as BoardColumn, PersonalBoardItem, PersonalBoardTagInfo } from './types';

// ---- Default column colors ----
const COLUMN_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
];

export function PersonalBoard() {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeItem, setActiveItem] = useState<PersonalBoardItem | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalColumnId, setModalColumnId] = useState('');
  const [editingItem, setEditingItem] = useState<PersonalBoardItem | null>(null);

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<PersonalBoardItem | null>(null);

  // Personal tags state
  const [availableTags, setAvailableTags] = useState<PersonalBoardTagInfo[]>([]);

  // Link task modal state
  const [linkTaskOpen, setLinkTaskOpen] = useState(false);

  // New column input
  const [showNewColumnInput, setShowNewColumnInput] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [creatingColumn, setCreatingColumn] = useState(false);

  // Sensors
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 10 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  // ---- Data fetching ----
  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch('/api/personal-board');
      if (!res.ok) throw new Error('Failed to fetch board');
      const json = await res.json();
      const columnsData = json.data?.columns || json.data || json.columns || [];
      const normalized: BoardColumn[] = Array.isArray(columnsData)
        ? columnsData.map((col: BoardColumn & { items: (PersonalBoardItem & { tagAssignments?: { tag: { id: string; name: string; color: string } }[] })[] }) => ({
            ...col,
            items: col.items.map((item) => ({
              ...item,
              tags: Array.isArray(item.tagAssignments)
                ? item.tagAssignments.map((a) => a.tag)
                : [],
            })),
          }))
        : [];
      setColumns(normalized);
    } catch {
      toast.error('Erro ao carregar o quadro.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // ---- Fetch personal tags ----
  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/personal-board/tags');
      if (!res.ok) return;
      const json = await res.json();
      setAvailableTags(Array.isArray(json.data) ? json.data : []);
    } catch {
      // Silent fail - tags are optional
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const handleCreateTag = useCallback(async (input: { name: string; color: string }): Promise<PersonalBoardTagInfo> => {
    const res = await fetch('/api/personal-board/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error('Failed to create tag');
    const json = await res.json();
    const newTag = json.data as PersonalBoardTagInfo;
    setAvailableTags((prev) => [...prev, newTag].sort((a, b) => a.name.localeCompare(b.name)));
    return newTag;
  }, []);

  // ---- Link task handlers ----
  const handleLinkTask = useCallback(async (taskId: string) => {
    if (!detailItem) return;
    const res = await fetch(`/api/personal-board/items/${detailItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedTaskId: taskId }),
    });
    if (!res.ok) throw new Error('Failed to link task');

    setColumns((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((i) =>
          i.id === detailItem.id ? { ...i, linkedTaskId: taskId } : i
        ),
      }))
    );
    setDetailItem((prev) => prev ? { ...prev, linkedTaskId: taskId } : null);
    toast.success('Task vinculada.');
  }, [detailItem]);

  const handleUnlinkTask = useCallback(async () => {
    if (!detailItem) return;
    const res = await fetch(`/api/personal-board/items/${detailItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedTaskId: null }),
    });
    if (!res.ok) throw new Error('Failed to unlink task');

    setColumns((prev) =>
      prev.map((c) => ({
        ...c,
        items: c.items.map((i) =>
          i.id === detailItem.id ? { ...i, linkedTaskId: null } : i
        ),
      }))
    );
    setDetailItem((prev) => prev ? { ...prev, linkedTaskId: null } : null);
    toast.success('Task desvinculada.');
  }, [detailItem]);

  // ---- Item map for quick lookup ----
  const itemsMap = useMemo(() => {
    const map = new Map<string, PersonalBoardItem>();
    for (const col of columns) {
      for (const item of col.items) {
        map.set(item.id, item);
      }
    }
    return map;
  }, [columns]);

  // ---- Column map ----
  const columnIdSet = useMemo(
    () => new Set(columns.map((c) => c.id)),
    [columns]
  );

  // ---- Drag handlers ----
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      const item = itemsMap.get(id);
      if (item) setActiveItem(item);
    },
    [itemsMap]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveItem(null);

      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      const item = itemsMap.get(activeId);
      if (!item) return;

      // Determine target column
      let targetColumnId: string | null = null;
      if (columnIdSet.has(overId)) {
        // Dropped directly on a column
        targetColumnId = overId;
      } else {
        // Dropped on another item - find its column
        const overItem = itemsMap.get(overId);
        if (overItem) {
          targetColumnId = overItem.columnId;
        }
      }

      if (!targetColumnId || targetColumnId === item.columnId) {
        // Same column - reorder
        if (targetColumnId && overId !== activeId) {
          const column = columns.find((c) => c.id === targetColumnId);
          if (column) {
            const overIndex = column.items.findIndex((i) => i.id === overId);
            const activeIndex = column.items.findIndex((i) => i.id === activeId);
            if (overIndex !== -1 && activeIndex !== -1) {
              // Build reorder payload
              const newItems = [...column.items];
              newItems.splice(activeIndex, 1);
              const insertAt = overIndex > activeIndex ? overIndex - 1 : overIndex;
              newItems.splice(insertAt, 0, item);

              // Optimistic update
              setColumns((prev) =>
                prev.map((c) =>
                  c.id === targetColumnId
                    ? { ...c, items: newItems.map((i, idx) => ({ ...i, order: idx })) }
                    : c
                )
              );

              // Build reorder payload for API
              const reorderItems = newItems.map((i, idx) => ({
                id: i.id,
                columnId: i.columnId,
                order: idx,
              }));

              try {
                await fetch('/api/personal-board/reorder', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ items: reorderItems }),
                });
              } catch {
                toast.error('Erro ao reordenar.');
                fetchBoard();
              }
            }
          }
        }
        return;
      }

      // Different column - move item
      const targetColumn = columns.find((c) => c.id === targetColumnId);
      if (!targetColumn) return;

      // Determine insert position
      let insertIndex = targetColumn.items.length;
      if (overId !== activeId && itemsMap.has(overId)) {
        const overItem = itemsMap.get(overId)!;
        const overIdx = targetColumn.items.findIndex((i) => i.id === overItem.id);
        if (overIdx !== -1) insertIndex = overIdx;
      }

      // Optimistic update
      setColumns((prev) =>
        prev.map((c) => {
          if (c.id === item.columnId) {
            // Remove from source column
            return {
              ...c,
              items: c.items
                .filter((i) => i.id !== activeId)
                .map((i, idx) => ({ ...i, order: idx })),
            };
          }
          if (c.id === targetColumnId) {
            // Insert into target column
            const newItems = [...c.items];
            const movedItem = { ...item, columnId: targetColumnId };
            newItems.splice(insertIndex, 0, movedItem);
            return {
              ...c,
              items: newItems.map((i, idx) => ({ ...i, order: idx })),
            };
          }
          return c;
        })
      );

      // Build reorder payload
      const updatedColumns = columns.map((c) => {
        if (c.id === item.columnId) {
          return {
            id: c.id,
            order: c.order,
          };
        }
        if (c.id === targetColumnId) {
          return {
            id: c.id,
            order: c.order,
          };
        }
        return { id: c.id, order: c.order };
      });

      const allItems: { id: string; columnId: string; order: number }[] = [];
      for (const col of columns) {
        if (col.id === item.columnId) {
          allItems.push(
            ...col.items
              .filter((i) => i.id !== activeId)
              .map((i, idx) => ({ id: i.id, columnId: col.id, order: idx }))
          );
        } else if (col.id === targetColumnId) {
          const newItems = [...col.items];
          const movedItem = { ...item, columnId: targetColumnId };
          newItems.splice(insertIndex, 0, movedItem);
          allItems.push(
            ...newItems.map((i, idx) => ({ id: i.id, columnId: targetColumnId, order: idx }))
          );
        } else {
          allItems.push(
            ...col.items.map((i, idx) => ({ id: i.id, columnId: col.id, order: idx }))
          );
        }
      }

      try {
        await fetch('/api/personal-board/reorder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            columns: updatedColumns,
            items: allItems,
          }),
        });
      } catch {
        toast.error('Erro ao mover item.');
        fetchBoard();
      }
    },
    [itemsMap, columnIdSet, columns, fetchBoard]
  );

  // ---- Column actions ----
  const handleCreateColumn = async () => {
    const trimmed = newColumnTitle.trim();
    if (!trimmed) return;

    setCreatingColumn(true);
    try {
      const colorIndex = columns.length % COLUMN_COLORS.length;
      const res = await fetch('/api/personal-board/columns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed, color: COLUMN_COLORS[colorIndex] }),
      });
      if (!res.ok) throw new Error('Failed to create column');
      setNewColumnTitle('');
      setShowNewColumnInput(false);
      await fetchBoard();
    } catch {
      toast.error('Erro ao criar coluna.');
    } finally {
      setCreatingColumn(false);
    }
  };

  const handleEditColumnTitle = async (columnId: string, title: string) => {
    try {
      const res = await fetch(`/api/personal-board/columns/${columnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error('Failed to update column');
      setColumns((prev) =>
        prev.map((c) => (c.id === columnId ? { ...c, title } : c))
      );
    } catch {
      toast.error('Erro ao renomear coluna.');
      fetchBoard();
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    try {
      const res = await fetch(`/api/personal-board/columns/${columnId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete column');
      setColumns((prev) => prev.filter((c) => c.id !== columnId));
      toast.success('Coluna excluída.');
    } catch {
      toast.error('Erro ao excluir coluna.');
    }
  };

  // ---- Item actions ----
  const handleOpenDetail = (item: PersonalBoardItem) => {
    setDetailItem(item);
    setDetailOpen(true);
  };

  const handleOpenAddItem = (columnId: string) => {
    setEditingItem(null);
    setModalColumnId(columnId);
    setModalOpen(true);
  };

  const handleOpenEditItem = (item: PersonalBoardItem) => {
    setEditingItem(item);
    setModalColumnId(item.columnId);
    setModalOpen(true);
  };

  const handleDeleteItem = async (item: PersonalBoardItem) => {
    try {
      const res = await fetch(`/api/personal-board/items/${item.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete item');
      setColumns((prev) =>
        prev.map((c) =>
          c.id === item.columnId
            ? { ...c, items: c.items.filter((i) => i.id !== item.id) }
            : c
        )
      );
      toast.success('Item excluído.');
    } catch {
      toast.error('Erro ao excluir item.');
    }
  };

  const handleSaveItem = async (data: {
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    tagIds?: string[];
  }) => {
    const { tagIds, ...itemData } = data;

    if (editingItem) {
      // Update existing
      const res = await fetch(`/api/personal-board/items/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
      });
      if (!res.ok) throw new Error('Failed to update item');

      // Assign tags if provided (non-blocking: item is already saved)
      let tagsFailed = false;
      if (tagIds !== undefined) {
        const tagRes = await fetch(`/api/personal-board/items/${editingItem.id}/tags`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagIds }),
        });
        if (!tagRes.ok) tagsFailed = true;
      }

      // Optimistic update
      const updatedTags = tagIds !== undefined && !tagsFailed
        ? availableTags.filter((t) => tagIds.includes(t.id))
        : editingItem.tags || [];

      setColumns((prev) =>
        prev.map((c) =>
          c.id === editingItem.columnId
            ? {
                ...c,
                items: c.items.map((i) =>
                  i.id === editingItem.id
                    ? { ...i, ...itemData, priority: itemData.priority as PersonalBoardItem['priority'], tags: updatedTags }
                    : i
                ),
              }
            : c
        )
      );

      // Update detail item if it's the same
      if (detailItem?.id === editingItem.id) {
        setDetailItem((prev) => prev ? {
          ...prev,
          ...itemData,
          priority: itemData.priority as PersonalBoardItem['priority'],
          tags: updatedTags,
        } : null);
      }

      if (tagsFailed) {
        toast.warning('Item atualizado, mas houve erro ao salvar as tags.');
      } else {
        toast.success('Item atualizado.');
      }
    } else {
      // Create new
      const res = await fetch(`/api/personal-board/columns/${modalColumnId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
      });
      if (!res.ok) throw new Error('Failed to create item');
      const json = await res.json();
      const newItem = json.data;

      // Assign tags to new item (non-blocking: item is already created)
      if (tagIds && tagIds.length > 0 && newItem?.id) {
        const tagRes = await fetch(`/api/personal-board/items/${newItem.id}/tags`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tagIds }),
        });
        if (!tagRes.ok) {
          await fetchBoard();
          toast.warning('Item criado, mas houve erro ao salvar as tags.');
          return;
        }
      }

      await fetchBoard();
      toast.success('Item criado.');
    }
  };

  // ---- Render ----
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <KanbanIcon className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Meu Quadro</h1>
          <p className="text-sm text-muted-foreground">
            Organize suas ideias e tarefas pessoais.
          </p>
        </div>
      </div>

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToWindowEdges]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="w-full min-w-0 overflow-hidden">
          <div className="w-full min-w-0 overflow-x-auto overflow-y-hidden pb-4 overscroll-x-contain">
            <div className="flex min-w-max gap-4 pr-1 items-start">
              {columns
                .sort((a, b) => a.order - b.order)
                .map((column) => (
                  <PersonalBoardColumn
                    key={column.id}
                    column={column}
                    onAddItem={handleOpenAddItem}
                    onDetailItem={handleOpenDetail}
                    onEditItem={handleOpenEditItem}
                    onDeleteItem={handleDeleteItem}
                    onEditColumnTitle={handleEditColumnTitle}
                    onDeleteColumn={handleDeleteColumn}
                  />
                ))}

              {/* New column */}
              <div className="flex-shrink-0 w-[min(18rem,calc(100vw-5rem))] sm:w-72 xl:w-80">
                {showNewColumnInput ? (
                  <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
                    <input
                      value={newColumnTitle}
                      onChange={(e) => setNewColumnTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateColumn();
                        if (e.key === 'Escape') {
                          setShowNewColumnInput(false);
                          setNewColumnTitle('');
                        }
                      }}
                      placeholder="Nome da coluna..."
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
                      maxLength={50}
                      autoFocus
                      disabled={creatingColumn}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleCreateColumn}
                        disabled={!newColumnTitle.trim() || creatingColumn}
                      >
                        {creatingColumn && (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        )}
                        Adicionar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowNewColumnInput(false);
                          setNewColumnTitle('');
                        }}
                        disabled={creatingColumn}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className="w-full h-auto min-h-[4rem] rounded-xl border-2 border-dashed border-muted-foreground/20 hover:border-muted-foreground/40 text-muted-foreground hover:text-foreground transition-colors py-4"
                    onClick={() => setShowNewColumnInput(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nova coluna
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeItem && (
            <div className="rotate-3 scale-105 opacity-90">
              <PersonalBoardCard item={activeItem} isDragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Item modal */}
      <PersonalBoardItemModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        item={editingItem}
        columnId={modalColumnId}
        availableTags={availableTags}
        onCreateTag={handleCreateTag}
        onSave={handleSaveItem}
      />

      {/* Detail modal */}
      <PersonalBoardDetailModal
        item={detailItem}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={(item) => {
          setEditingItem(item);
          setModalColumnId(item.columnId);
          setModalOpen(true);
        }}
        onDelete={handleDeleteItem}
        onOpenLinkTask={() => setLinkTaskOpen(true)}
      />

      {/* Link task modal */}
      <PersonalBoardLinkTaskModal
        open={linkTaskOpen}
        onOpenChange={setLinkTaskOpen}
        currentLinkedTaskId={detailItem?.linkedTaskId}
        onLink={handleLinkTask}
        onUnlink={handleUnlinkTask}
      />
    </div>
  );
}
