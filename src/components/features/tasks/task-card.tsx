'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Bug, Ban, GitPullRequest, GitBranch, CircleDot, Loader2 } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { PriorityIndicator } from './priority-indicator';
import { TagBadge } from '@/components/features/tags';
import { TaskHierarchyPath } from './task-hierarchy-path';
import { BlockTaskDialog } from './block-task-dialog';
import { FocusBadge } from './focus-badge';
import { useBlockTaskDialog } from '@/hooks/use-block-task-dialog';
import { toast } from 'sonner';
import { SyncIndicator } from '@/components/ui/sync-indicator';
import { OptimisticWrapper } from '@/components/ui/optimistic-wrapper';
import type { TaskWithReadableId } from '@/shared/types';

// Generate consistent colors for modules based on hash (legacy fallback)
const MODULE_COLORS = [
  'bg-purple-500/20 text-purple-300 border-purple-500/30',
  'bg-blue-500/20 text-blue-300 border-blue-500/30',
  'bg-green-500/20 text-green-300 border-green-500/30',
  'bg-orange-500/20 text-orange-300 border-orange-500/30',
  'bg-pink-500/20 text-pink-300 border-pink-500/30',
  'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getModuleColor(module: string): string {
  const index = hashString(module) % MODULE_COLORS.length;
  return MODULE_COLORS[index];
}

interface TaskCardProps {
  task: TaskWithReadableId;
  variant?: 'kanban' | 'compact';
  isDragging?: boolean;
  isFetching?: boolean;
  isOptimistic?: boolean;
  onClick?: () => void;
  className?: string;
}

export function TaskCard({
  task,
  variant = 'kanban',
  isDragging = false,
  isFetching = false,
  isOptimistic = false,
  onClick,
  className,
}: TaskCardProps) {
  const isBug = task.type === 'BUG';
  const blockDialog = useBlockTaskDialog(task);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const isCreatingBranchRef = useRef(false);

  // Prefer new tags system, fallback to legacy modules
  const hasTags = task.tags && task.tags.length > 0;
  const hasModules = task.modules && task.modules.length > 0;

  const handleCheckboxClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // Previne abertura do modal
  }, []);

  const handleCreateBranch = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCreatingBranchRef.current) return;
    isCreatingBranchRef.current = true;
    setIsCreatingBranch(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/github/branch`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message || 'Erro ao criar branch');
        return;
      }
      const branchName = data.data?.branchName || data.branchName;
      const branchUrl = data.data?.branchUrl || data.branchUrl;
      if (branchUrl) {
        toast.success(
          <div className="flex flex-col gap-1">
            <span>Branch criada:</span>
            <a
              href={branchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline break-all text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              {branchName}
            </a>
          </div>
        );
      } else {
        toast.success(`Branch criada: ${branchName}`);
      }
      if (navigator.clipboard && window.isSecureContext && branchUrl) {
        try {
          await navigator.clipboard.writeText(branchUrl);
        } catch {
          // ignore clipboard failure
        }
      }
    } catch {
      toast.error('Erro ao criar branch');
    } finally {
      isCreatingBranchRef.current = false;
      setIsCreatingBranch(false);
    }
  }, [task.id]);

  return (
    <OptimisticWrapper isOptimistic={isOptimistic}>
      <Card
        onClick={onClick}
        className={cn(
          'p-4 cursor-pointer transition-all duration-200 relative',
          'hover:bg-accent/50 hover:border-primary/30',
          isBug && 'border-l-2 border-l-red-500',
          task.blocked && 'border-red-500/50 bg-red-500/5',
          isDragging && 'rotate-2 scale-[1.02] shadow-lg opacity-90',
          className
        )}
      >
      {/* Sync Indicator - shows when data is being updated */}
      <SyncIndicator isFetching={isFetching} />
      
      {/* Header: Tags/Modules + ID + Priority */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Prefer new tags system */}
          {hasTags ? (
            <>
              {task.tags!.slice(0, 2).map((tag) => (
                <TagBadge key={tag.id} tag={tag} size="sm" />
              ))}
              {task.tags!.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{task.tags!.length - 2}</span>
              )}
            </>
          ) : hasModules ? (
            /* Fallback to legacy modules */
            <>
              {task.modules.slice(0, 2).map((mod) => (
                <Badge
                  key={mod}
                  variant="outline"
                  className={cn('text-[10px] px-1.5 py-0 shrink-0', getModuleColor(mod))}
                >
                  {mod}
                </Badge>
              ))}
              {task.modules.length > 2 && (
                <span className="text-[10px] text-muted-foreground">+{task.modules.length - 2}</span>
              )}
            </>
          ) : null}
          <span className="text-xs text-muted-foreground font-mono truncate">
            {task.readableId}
          </span>
        </div>
        <PriorityIndicator priority={task.priority} />
      </div>


      {/* Body: Title */}
      <h4 className={cn(
        'text-sm font-medium leading-relaxed mb-3',
        variant === 'kanban' ? 'line-clamp-2' : 'line-clamp-1'
      )}>
        {task.title}
      </h4>

      {/* Focus Badge */}
      {task.focus && (
        <div className="mb-2">
          <FocusBadge focus={task.focus} size="sm" />
        </div>
      )}

      {/* Hierarchy Path */}
      <div className="mb-3">
        <TaskHierarchyPath task={task} />
      </div>

      {/* Footer: Avatar + Points + Bug + Blocked */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.assigneeId && (
            <Avatar className="h-5 w-5" title={task.assignee?.displayName || 'Assignee'}>
              <AvatarImage src={task.assignee?.avatarUrl || undefined} />
              <AvatarFallback className="text-[10px] bg-muted">
                {task.assignee?.displayName?.slice(0, 2).toUpperCase() || task.assigneeId.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>

        <div className="flex items-center gap-2">
          {task.points && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {task.points}
            </Badge>
          )}
          {task.githubPrNumber ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {task.githubPrUrl ? (
                  <a
                    href={task.githubPrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 py-0 gap-1 cursor-pointer hover:bg-accent/50',
                        task.githubPrStatus === 'merged' && 'border-purple-500/50 text-purple-400',
                        task.githubPrStatus === 'open' && 'border-green-500/50 text-green-400',
                        task.githubPrStatus === 'closed' && 'border-red-500/50 text-red-400',
                        !task.githubPrStatus && 'border-muted-foreground/30 text-muted-foreground',
                      )}
                    >
                      <GitPullRequest className="w-3 h-3" />
                      #{task.githubPrNumber}{task.githubPrStatus ? ` ${task.githubPrStatus}` : ''}
                    </Badge>
                  </a>
                ) : (
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px] px-1.5 py-0 gap-1',
                      task.githubPrStatus === 'merged' && 'border-purple-500/50 text-purple-400',
                      task.githubPrStatus === 'open' && 'border-green-500/50 text-green-400',
                      task.githubPrStatus === 'closed' && 'border-red-500/50 text-red-400',
                      !task.githubPrStatus && 'border-muted-foreground/30 text-muted-foreground',
                    )}
                  >
                    <GitPullRequest className="w-3 h-3" />
                    #{task.githubPrNumber}{task.githubPrStatus ? ` ${task.githubPrStatus}` : ''}
                  </Badge>
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  PR #{task.githubPrNumber} - {task.githubPrStatus || 'linked'}
                </p>
              </TooltipContent>
            </Tooltip>
          ) : task.githubIssueNumber ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {task.githubIssueUrl ? (
                  <a
                    href={task.githubIssueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex"
                  >
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 gap-1 cursor-pointer hover:bg-accent/50 border-muted-foreground/30 text-muted-foreground"
                    >
                      <CircleDot className="w-3 h-3" />
                      #{task.githubIssueNumber}
                    </Badge>
                  </a>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 gap-1 border-muted-foreground/30 text-muted-foreground"
                  >
                    <CircleDot className="w-3 h-3" />
                    #{task.githubIssueNumber}
                  </Badge>
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Issue #{task.githubIssueNumber}</p>
              </TooltipContent>
            </Tooltip>
          ) : null}
          {(task.githubPrNumber || task.githubPrUrl) && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 gap-1 cursor-pointer hover:bg-accent/50 border-muted-foreground/30 text-muted-foreground"
              onClick={handleCreateBranch}
            >
              {isCreatingBranch ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <GitBranch className="w-3 h-3" />
              )}
              Branch
            </Badge>
          )}
          {isBug && (
            <Bug className="w-3.5 h-3.5 text-red-500" />
          )}
          {/* Blocked toggle - apenas se não estiver DONE */}
          {task.status !== 'DONE' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  onClick={handleCheckboxClick}
                  className="flex items-center gap-1 cursor-pointer"
                >
                  <Checkbox
                    checked={task.blocked}
                    disabled={blockDialog.isPending}
                    onCheckedChange={blockDialog.handleBlockedChange}
                    aria-label="Marcar task como bloqueada"
                    className={cn(
                      'h-3.5 w-3.5',
                      task.blocked && 'border-red-500 data-[state=checked]:bg-red-500'
                    )}
                  />
                  {task.blocked && (
                    <Ban className="w-3 h-3 text-red-500" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-[200px]">
                <p className="text-xs">
                  {task.blocked ? 'Task bloqueada' : 'Marcar como bloqueada'}
                </p>
                {/* ✅ Guard: só mostra se blockReason não for vazio/null */}
                {task.blocked && task.blockReason?.trim() && (
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                    Motivo: {task.blockReason}
                  </p>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Modal de bloqueio */}
      <BlockTaskDialog
        {...blockDialog}
        taskTitle={task.title}
      />
      </Card>
    </OptimisticWrapper>
  );
}
