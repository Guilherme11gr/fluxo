'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, PriorityIndicator } from '@/components/features/tasks';
import type { TaskWithReadableId } from '@/shared/types';

// Module colors - same as task-card
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

interface TableRowProps {
  task: TaskWithReadableId;
  onClick?: () => void;
  className?: string;
}

export function TableRow({ task, onClick, className }: TableRowProps) {
  const isBug = task.type === 'BUG';

  return (
    <div
      onClick={onClick}
      className={cn(
        'grid grid-cols-[100px_1fr_120px_100px_100px_60px] gap-4 items-center',
        'px-4 py-3 cursor-pointer',
        'transition-colors duration-150',
        'hover:bg-accent/50',
        'border-b border-border/50',
        isBug && 'border-l-2 border-l-red-500',
        className
      )}
    >
      {/* ID */}
      <span className="font-mono text-sm text-muted-foreground truncate">
        {task.readableId}
      </span>

      {/* Title */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate">{task.title}</span>
        {isBug && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
            BUG
          </Badge>
        )}
      </div>

      {/* Status */}
      <StatusBadge status={task.status} />

      {/* Priority */}
      <PriorityIndicator priority={task.priority} showLabel />

      {/* Module(s) */}
      <div className="flex items-center gap-1 truncate">
        {task.modules && task.modules.length > 0 ? (
          <>
            {task.modules.slice(0, 1).map((mod) => (
              <Badge
                key={mod}
                variant="outline"
                className={cn('text-[10px] px-1.5 py-0', getModuleColor(mod))}
              >
                {mod}
              </Badge>
            ))}
            {task.modules.length > 1 && (
              <span className="text-[10px] text-muted-foreground">+{task.modules.length - 1}</span>
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </div>

      {/* Points */}
      <div className="text-center">
        {task.points ? (
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            {task.points}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </div>
    </div>
  );
}
