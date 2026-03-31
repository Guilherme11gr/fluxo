'use client';

import { useDroppable } from '@dnd-kit/core';
import { Plus, Pencil, Trash2, X, Check, GripVertical } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PersonalBoardCard } from './personal-board-card';
import type { PersonalBoardColumn, PersonalBoardItem } from './types';

interface PersonalBoardColumnProps {
  column: PersonalBoardColumn;
  onAddItem: (columnId: string) => void;
  onEditItem: (item: PersonalBoardItem) => void;
  onDeleteItem: (item: PersonalBoardItem) => void;
  onEditColumnTitle: (columnId: string, title: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

export function PersonalBoardColumn({
  column,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onEditColumnTitle,
  onDeleteColumn,
}: PersonalBoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(column.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleDoubleClick = () => {
    setEditedTitle(column.title);
    setIsEditingTitle(true);
  };

  const handleTitleSave = () => {
    const trimmed = editedTitle.trim();
    if (trimmed && trimmed !== column.title) {
      onEditColumnTitle(column.id, trimmed);
    } else {
      setEditedTitle(column.title);
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleTitleSave();
    if (e.key === 'Escape') {
      setEditedTitle(column.title);
      setIsEditingTitle(false);
    }
  };

  const sortedItems = [...column.items].sort((a, b) => a.order - b.order);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 bg-muted/30 rounded-xl border border-transparent hover:border-border/40 transition-all duration-300',
        'w-[min(18rem,calc(100vw-5rem))] sm:w-72 xl:w-80 p-4',
        isOver && 'bg-accent/40 ring-2 ring-primary/20 border-primary/30'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: column.color || '#6b7280' }}
        />
        {isEditingTitle ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              ref={titleInputRef}
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleTitleKeyDown}
              className="flex-1 bg-background border border-border rounded px-1.5 py-0.5 text-sm font-semibold outline-none focus:ring-1 focus:ring-primary"
              maxLength={50}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0"
              onClick={handleTitleSave}
            >
              <Check className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <>
            <h3
              className="text-sm font-semibold flex-1 min-w-0 truncate cursor-default"
              onDoubleClick={handleTitleDoubleClick}
              title="Clique duplo para editar"
            >
              {column.title}
            </h3>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {column.items.length}
            </span>
          </>
        )}

        {/* Column actions */}
        {!isEditingTitle && (
          <div className="flex-shrink-0">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => {
                    onDeleteColumn(column.id);
                    setShowDeleteConfirm(false);
                  }}
                  title="Confirmar exclusão"
                >
                  <Check className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setShowDeleteConfirm(false)}
                  title="Cancelar"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ opacity: 1 }}
                onClick={() => setShowDeleteConfirm(true)}
                title="Excluir coluna"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-2.5 min-h-[120px] max-h-[calc(100vh-20rem)] overflow-y-auto pr-0.5">
        {sortedItems.map((item) => (
          <PersonalBoardCard
            key={item.id}
            item={item}
            onEdit={onEditItem}
            onDelete={onDeleteItem}
          />
        ))}

        {/* Empty state */}
        {column.items.length === 0 && (
          <div className="flex items-center justify-center h-24 border-2 border-dashed border-muted-foreground/10 rounded-lg bg-background/20">
            <p className="text-xs text-muted-foreground/60 font-medium">
              Arraste itens aqui
            </p>
          </div>
        )}
      </div>

      {/* Add item button */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full mt-3 text-xs text-muted-foreground hover:text-foreground justify-start"
        onClick={() => onAddItem(column.id)}
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        Novo item
      </Button>
    </div>
  );
}
