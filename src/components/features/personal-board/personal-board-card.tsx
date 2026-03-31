'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontal, Pencil, Trash2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { PersonalBoardItem } from './types';

const PRIORITY_CONFIG = {
  none: { label: '', color: '' },
  low: { label: 'Baixa', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  medium: { label: 'Média', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
} as const;

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  } catch {
    return dateStr;
  }
}

interface PersonalBoardCardProps {
  item: PersonalBoardItem;
  isDragging?: boolean;
  onEdit?: (item: PersonalBoardItem) => void;
  onDelete?: (item: PersonalBoardItem) => void;
}

export function PersonalBoardCard({
  item,
  isDragging: isDraggingProp,
  onEdit,
  onDelete,
}: PersonalBoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    willChange: isDragging ? 'transform' : 'auto',
  };

  const priorityCfg = item.priority ? PRIORITY_CONFIG[item.priority] : PRIORITY_CONFIG.none;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'transition-shadow duration-200',
        (isDragging || isDraggingProp) && 'z-50 cursor-grabbing'
      )}
    >
      <div className="relative group rounded-lg bg-card border shadow-sm hover:shadow-md transition p-3">
        {/* Title */}
        <p className="font-medium text-sm leading-snug pr-6">{item.title}</p>

        {/* Description */}
        {item.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5">
            {item.description}
          </p>
        )}

        {/* Badges row */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {item.priority !== 'none' && priorityCfg.label && (
            <span
              className={cn(
                'text-[10px] px-1.5 py-0 rounded-full font-medium',
                priorityCfg.color
              )}
            >
              {priorityCfg.label}
            </span>
          )}
          {item.dueDate && (
            <span className="text-[10px] px-1.5 py-0 rounded-full bg-muted text-muted-foreground font-medium flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />
              {formatDate(item.dueDate)}
            </span>
          )}
        </div>

        {/* Action menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity data-[state=open]:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit?.(item)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onDelete?.(item)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
