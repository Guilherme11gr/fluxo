'use client';

import { Loader2, FolderKanban, Layers, Box, Bug, ClipboardList, Calendar, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from '@/components/features/tasks/status-badge';
import type { TaskWithReadableId, TaskPriority, TaskType } from '@/shared/types';

interface ExecutionContextCardProps {
  taskId: string;
  task: TaskWithReadableId | null | undefined;
  isLoading: boolean;
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: 'bg-muted/50 text-muted-foreground',
  MEDIUM: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  HIGH: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  CRITICAL: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

const TYPE_LABELS: Record<TaskType, string> = {
  TASK: 'Task',
  BUG: 'Bug',
};

function formatCreatedAt(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ExecutionContextCard({ taskId, task, isLoading }: ExecutionContextCardProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando task...
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        Task <span className="font-mono">{taskId.slice(0, 8)}...</span> não encontrada
      </div>
    );
  }

  const feature = task.feature;
  const epic = feature?.epic;
  const project = epic?.project;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">
            {task.title}
          </div>
          {task.description && (
            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {task.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {task.githubIssueUrl && (
            <a
              href={task.githubIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
            {task.readableId}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={task.status} size="sm" />
        <Badge variant="secondary" className={PRIORITY_STYLES[task.priority]}>
          {PRIORITY_LABELS[task.priority]}
        </Badge>
        {task.type === 'BUG' ? (
          <Badge variant="outline" className="text-red-500 border-red-500/30 gap-1">
            <Bug className="h-3 w-3" />
            Bug
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground gap-1">
            <ClipboardList className="h-3 w-3" />
            {TYPE_LABELS[task.type]}
          </Badge>
        )}
        {task.points != null && task.points > 0 && (
          <Badge variant="outline" className="text-xs">{task.points}pt</Badge>
        )}
      </div>

      {(project || epic || feature) && (
        <>
          <Separator />
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            {project && (
              <span className="inline-flex items-center gap-1">
                <FolderKanban className="h-3 w-3" />
                {project.name}
              </span>
            )}
            {epic && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  {epic.title}
                </span>
              </>
            )}
            {feature && (
              <>
                <span className="text-muted-foreground/50">/</span>
                <span className="inline-flex items-center gap-1">
                  <Box className="h-3 w-3" />
                  {feature.title}
                </span>
              </>
            )}
          </div>
        </>
      )}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {task.createdAt && (
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatCreatedAt(task.createdAt)}
          </span>
        )}
        {task.assigneeAgent && (
          <>
            <span className="text-muted-foreground/30">|</span>
            <span>
              Agente: <span className="text-foreground font-medium">{task.assigneeAgent.name}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}