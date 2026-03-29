'use client';

import { useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MarkdownViewer } from '@/components/ui/markdown-viewer';
import {
  Bug,
  CheckSquare,
  ChevronRight,
  Pencil,
  Trash2,
  Calendar,
  User,
  Layers,
  Hash,
  Copy,
  Layout,
  Tag,
  Ban,
} from 'lucide-react';
import type { TaskWithReadableId, TaskStatus } from '@/shared/types';
import { cn } from '@/lib/utils';
import { StatusBadge } from './status-badge';
import { PriorityIndicator } from './priority-indicator';
import { TaskComments } from './task-comments';
import { UserAvatar } from '@/components/features/shared';
import { BlockTaskDialog } from './block-task-dialog';
import { useBlockTaskDialog } from '@/hooks/use-block-task-dialog';
import { useMoveTaskWithUndo } from '@/hooks/use-move-task-undo';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { KaiExecuteButton } from '@/components/features/kai/kai-execute-button';

interface TaskDetailModalProps {
  task: TaskWithReadableId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (task: TaskWithReadableId) => void;
  onDelete?: (task: TaskWithReadableId) => void;
}

// Priority labels in Portuguese
const priorityLabels: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

// Status labels in Portuguese
const STATUS_LABELS: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'A Fazer',
  DOING: 'Em Andamento',
  REVIEW: 'Em Revisão',
  QA_READY: 'QA',
  DONE: 'Concluído',
};

export function TaskDetailModal({
  task,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: TaskDetailModalProps) {
  // 🔴 CRITICAL: Hooks devem ser chamados SEMPRE, mesmo se task for null
  // Early return só deve acontecer após todos os hooks
  const { profile } = useAuth();
  const blockDialog = useBlockTaskDialog(task || { id: '', blocked: false } as any); // Dummy para hooks
  const { moveWithUndo, isPending: isMovePending } = useMoveTaskWithUndo();

  // Get current org slug for deep links
  const currentOrgSlug = profile?.memberships.find(m => m.orgId === profile.currentOrgId)?.orgSlug;

  const handleEdit = useCallback(() => {
    if (task && onEdit) {
      onEdit(task);
      onOpenChange(false);
    }
  }, [task, onEdit, onOpenChange]);

  const handleDelete = useCallback(() => {
    if (task && onDelete) {
      onDelete(task);
      onOpenChange(false);
    }
  }, [task, onDelete, onOpenChange]);

  const handleCopyId = () => {
    if (task?.readableId) {
      navigator.clipboard.writeText(task.readableId);
      toast.success('ID copiado para a área de transferência');
    }
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    if (!task) return;
    moveWithUndo(task.id, newStatus, task.readableId);
  };

  // Early return APÓS todos os hooks (Rules of Hooks)
  if (!task) return null;

  const isBug = task.type === 'BUG';
  const TaskIcon = isBug ? Bug : CheckSquare;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl w-full overflow-y-auto p-0 gap-0 border-l">

        {/* Header Section */}
        <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b shadow-sm">
          <div className="p-6 space-y-4">
            {/* Breadcrumb & ID */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap leading-relaxed">
                <Layout className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium hover:text-foreground transition-colors cursor-default whitespace-nowrap">{task.feature?.epic?.project?.name}</span>
                <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
                <span className="hover:text-foreground transition-colors cursor-default whitespace-nowrap max-w-[100px] truncate" title={task.feature?.epic?.title}>{task.feature?.epic?.title}</span>
                <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
                <span className="hover:text-foreground transition-colors cursor-default font-medium text-foreground/80 truncate max-w-[150px]" title={task.feature?.title}>{task.feature?.title}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground gap-1.5" onClick={() => {
                  const url = new URL(window.location.origin + '/tasks');
                  url.searchParams.set('task', task.id);
                  if (currentOrgSlug) {
                    url.searchParams.set('org', currentOrgSlug);
                  }
                  navigator.clipboard.writeText(url.toString());
                  toast.success('Link da task copiado!');
                }}>
                  <Copy className="h-3.5 w-3.5" />
                  <span className="text-xs">Link</span>
                </Button>
                <Badge variant="outline" className="font-mono text-xs cursor-copy hover:bg-muted" onClick={handleCopyId} title="Copiar ID">
                  {task.readableId}
                </Badge>
              </div>
            </div>

            <div className="flex items-start gap-3">
              {/* Icon Box */}
              <div className={`mt-1 p-1.5 rounded-lg shrink-0 ${isBug ? 'bg-red-500/10 text-red-600' : 'bg-blue-500/10 text-blue-600'}`}>
                <TaskIcon className="h-4 w-4" />
              </div>

              <div className="space-y-1">
                <SheetTitle className="text-lg font-semibold leading-relaxed tracking-tight">
                  {task.title}
                </SheetTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Criado em {new Date(task.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* New Horizontal Metadata Bar - Dense */}
          <div className="px-5 pb-3 flex flex-wrap gap-3 items-center text-sm border-t bg-muted/20 pt-2">

            {/* Status Select - Editável */}
            <Select 
              value={task.status} 
              onValueChange={handleStatusChange}
              disabled={isMovePending}
            >
              <SelectTrigger className="h-6 text-xs px-2.5 shadow-sm w-auto gap-1.5 border-0 ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BACKLOG">{STATUS_LABELS.BACKLOG}</SelectItem>
                <SelectItem value="TODO">{STATUS_LABELS.TODO}</SelectItem>
                <SelectItem value="DOING">{STATUS_LABELS.DOING}</SelectItem>
                <SelectItem value="REVIEW">{STATUS_LABELS.REVIEW}</SelectItem>
                <SelectItem value="QA_READY">{STATUS_LABELS.QA_READY}</SelectItem>
                <SelectItem value="DONE">{STATUS_LABELS.DONE}</SelectItem>
              </SelectContent>
            </Select>

            <Separator orientation="vertical" className="h-4" />

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-background/50 text-xs font-medium shadow-sm" title="Prioridade">
              <PriorityIndicator priority={task.priority} />
              <span>{priorityLabels[task.priority]}</span>
            </div>

            <Separator orientation="vertical" className="h-4" />

            <div className="flex items-center gap-1.5 text-muted-foreground/80" title="Story Points">
              <Hash className="h-3.5 w-3.5" />
              <span className="font-medium font-mono text-foreground">{task.points || '-'}</span>
              <span className="text-xs">pts</span>
            </div>

            {task.modules && task.modules.length > 0 && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2 text-muted-foreground/80 flex-wrap">
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                  {task.modules.map((mod) => (
                    <Badge key={mod} variant="secondary" className="text-[10px] h-5 px-1.5">{mod}</Badge>
                  ))}
                </div>
              </>
            )}

            <Separator orientation="vertical" className="h-4" />

            <div className="flex items-center gap-2" title="Responsável">
              <UserAvatar 
                userId={task.assigneeId || undefined}
                displayName={task.assignee?.displayName}
                avatarUrl={task.assignee?.avatarUrl}
                size="sm" 
              />
              <span className="text-xs text-muted-foreground">
                {task.assignee?.displayName || 'Sem responsável'}
              </span>
            </div>

            {/* Blocked status - apenas se não estiver DONE */}
            {task.status !== 'DONE' && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border bg-background/50 shadow-sm">
                  <Checkbox
                    id="task-blocked"
                    checked={task.blocked}
                    disabled={blockDialog.isPending}
                    onCheckedChange={blockDialog.handleBlockedChange}
                    className={cn(
                      'h-4 w-4',
                      task.blocked && 'border-red-500 data-[state=checked]:bg-red-500'
                    )}
                  />
                  <Label
                    htmlFor="task-blocked"
                    className={cn(
                      'text-xs font-medium cursor-pointer',
                      task.blocked ? 'text-red-500' : 'text-muted-foreground'
                    )}
                  >
                    {task.blocked ? (
                      <span className="flex items-center gap-1">
                        <Ban className="h-3 w-3" />
                        Bloqueada
                      </span>
                    ) : (
                      'Bloqueada'
                    )}
                  </Label>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 space-y-8 pb-20">
          {/* Block Reason - Se task estiver bloqueada */}
          {task.blocked && task.blockReason?.trim() && (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center gap-2 text-red-500">
                  <Ban className="h-4 w-4" />
                  Motivo do Bloqueio
                </h3>
                <div className="text-sm leading-relaxed bg-red-500/5 border border-red-500/20 p-4 rounded-lg">
                  <p className="text-foreground/90 whitespace-pre-wrap">{task.blockReason}</p>
                  {/* ✅ Exibir audit trail (quando disponível) */}
                  {(task.blockedAt || task.blockedBy) && (
                    <div className="mt-3 pt-3 border-t border-red-500/10 text-xs text-muted-foreground flex flex-wrap gap-3">
                      {task.blockedAt && (
                        <span>
                          Bloqueada em {new Date(task.blockedAt).toLocaleDateString('pt-BR', { 
                            day: '2-digit', 
                            month: '2-digit', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                      {task.blockedBy && task.assignee && (
                        <span>• Por {task.assignee.displayName || 'Usuário'}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Description */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2 text-foreground/80">
              Descrição
            </h3>
            <div className="min-h-[100px] text-sm leading-relaxed">
              {task.description ? (
                <MarkdownViewer value={task.description} />
              ) : (
                <div className="text-sm text-muted-foreground italic bg-muted/30 p-4 rounded-lg border border-dashed text-center">
                  Nenhuma descrição fornecida para esta tarefa.
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Comments Section */}
          <TaskComments taskId={task.id} />
        </div>

        {/* Footer Actions - Sticky Bottom */}
        <div className="sticky bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t p-4 flex gap-3 justify-end z-10">
          <KaiExecuteButton
            taskId={task.id}
            projectHasRepo={true}
            className="h-9"
          />
          <Button variant="outline" className="gap-2" onClick={handleEdit}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button variant="outline" className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Excluir
          </Button>
        </div>

        <SheetDescription className="sr-only">
          Detalhes da task {task.readableId}
        </SheetDescription>
      </SheetContent>

      {/* Modal de bloqueio */}
      <BlockTaskDialog
        {...blockDialog}
        taskTitle={task.title}
      />
    </Sheet>
  );
}
