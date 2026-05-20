'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  StickyNote,
  Pencil,
  Trash2,
  Calendar,
  AlertCircle,
  Link as LinkIcon,
  Tag,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownViewer } from '@/components/ui/markdown-viewer';
import { TagBadge } from '@/components/features/tags/tag-badge';
import { StatusBadge } from '@/components/features/tasks/status-badge';
import { useLinkedTaskPreview } from '@/lib/query/hooks/use-linked-task';
import type { TaskStatus } from '@/shared/types';
import type { PersonalBoardItem } from './types';

const PRIORITY_CONFIG = {
  none: { label: '', color: '', icon: false },
  low: { label: 'Baixa', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', icon: false },
  medium: { label: 'Média', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300', icon: false },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: true },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: true },
} as const;

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function isOverdue(dateStr: string): boolean {
  try {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  } catch {
    return false;
  }
}

interface PersonalBoardDetailModalProps {
  item: PersonalBoardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (item: PersonalBoardItem) => void;
  onDelete?: (item: PersonalBoardItem) => void;
  onOpenLinkTask?: () => void;
}

export function PersonalBoardDetailModal({
  item,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  onOpenLinkTask,
}: PersonalBoardDetailModalProps) {
  const router = useRouter();
  const { data: linkedTask } = useLinkedTaskPreview(item?.linkedTaskId);

  const handleEdit = useCallback(() => {
    if (item && onEdit) {
      onEdit(item);
      onOpenChange(false);
    }
  }, [item, onEdit, onOpenChange]);

  const handleDelete = useCallback(() => {
    if (item && onDelete) {
      onDelete(item);
      onOpenChange(false);
    }
  }, [item, onDelete, onOpenChange]);

  if (!item) return null;

  const priorityCfg = item.priority ? PRIORITY_CONFIG[item.priority] : PRIORITY_CONFIG.none;
  const hasDescription = item.description?.trim();
  const hasTags = item.tags && item.tags.length > 0;
  const hasLinkedTask = !!item.linkedTaskId;
  const overdue = item.dueDate ? isOverdue(item.dueDate) : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg w-full overflow-y-auto p-0 gap-0 border-l">
        {/* Header */}
        <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b shadow-sm">
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <StickyNote className="h-3.5 w-3.5 shrink-0" />
              <span>Meu Quadro</span>
            </div>

            <SheetTitle className="text-lg font-semibold leading-relaxed tracking-tight">
              {item.title}
            </SheetTitle>

            {item.createdAt && (
              <p className="text-xs text-muted-foreground">
                Criado em {formatDate(item.createdAt)}
              </p>
            )}
          </div>

          {/* Metadata bar */}
          <div className="px-5 pb-3 flex flex-wrap gap-3 items-center text-sm border-t bg-muted/20 pt-2">
            {/* Priority */}
            {item.priority && item.priority !== 'none' && priorityCfg.label && (
              <div
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium shadow-sm',
                  priorityCfg.color
                )}
              >
                {priorityCfg.icon && <AlertCircle className="h-3 w-3" />}
                {priorityCfg.label}
              </div>
            )}

            {/* Due date */}
            {item.dueDate && (
              <>
                {(item.priority && item.priority !== 'none') && (
                  <Separator orientation="vertical" className="h-4" />
                )}
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-background/50 text-xs font-medium shadow-sm',
                    overdue && 'border-red-300 text-red-600 dark:border-red-700 dark:text-red-400'
                  )}
                >
                  <Calendar className="h-3 w-3" />
                  {formatDate(item.dueDate)}
                  {overdue && (
                    <span className="text-[10px] ml-1 font-semibold">Atrasado</span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8 pb-20">
          {/* Tags */}
          {hasTags && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2 text-foreground/80">
                <Tag className="h-4 w-4" />
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {item.tags!.map((tag) => (
                  <TagBadge key={tag.id} tag={tag} size="md" />
                ))}
              </div>
            </div>
          )}

          {/* Linked Task */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2 text-foreground/80">
              <LinkIcon className="h-4 w-4" />
              Task vinculada
            </h3>
            {hasLinkedTask ? (
              <div className="space-y-2">
                {linkedTask ? (
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={linkedTask.status as TaskStatus} size="sm" />
                      <span className="text-xs font-mono text-muted-foreground">{linkedTask.readableId}</span>
                    </div>
                    <p className="text-sm font-medium">{linkedTask.title}</p>
                    {linkedTask.currentExecutionId && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-xs text-amber-500">Execução ativa</span>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => router.push(`/tasks?task=${linkedTask.id}`)}>
                        Abrir task
                      </Button>
                      {linkedTask.currentExecutionId && (
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => router.push(`/kai-executions/${linkedTask.currentExecutionId}`)}>
                          Ver execução <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs">
                      {item.linkedTaskId!.slice(0, 8)}...
                    </Badge>
                    <span className="text-xs text-muted-foreground">Carregando...</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => onOpenLinkTask?.()}
                >
                  Alterar
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => onOpenLinkTask?.()}
              >
                <LinkIcon className="h-3 w-3" />
                Vincular a uma task
              </Button>
            )}
          </div>

          {/* Description */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2 text-foreground/80">
              Descrição
            </h3>
            <div className="min-h-[80px] text-sm leading-relaxed">
              {hasDescription ? (
                <MarkdownViewer value={item.description!} />
              ) : (
                <div className="text-sm text-muted-foreground italic bg-muted/30 p-4 rounded-lg border border-dashed text-center">
                  Nenhuma descrição fornecida.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sticky footer actions */}
        <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3 justify-end z-10">
          {onEdit && (
            <Button variant="outline" className="gap-2" onClick={handleEdit}>
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
          )}
          {onDelete && (
            <Button
              variant="outline"
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          )}
        </div>

        <SheetDescription className="sr-only">
          Detalhes do item do quadro pessoal: {item.title}
        </SheetDescription>
      </SheetContent>
    </Sheet>
  );
}
