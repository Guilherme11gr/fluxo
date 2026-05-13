'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TaskFocus } from '@/shared/types';

interface FocusBadgeProps {
  focus: TaskFocus | null | undefined;
  className?: string;
  size?: 'sm' | 'md';
}

const FOCUS_CONFIG: Record<string, { label: string; emoji: string; className: string }> = {
  TODAY: {
    label: 'Hoje',
    emoji: '🔥',
    className: 'bg-orange-500/15 text-orange-400 border-orange-500/30 hover:bg-orange-500/25',
  },
  THIS_WEEK: {
    label: 'Esta Semana',
    emoji: '📅',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30 hover:bg-blue-500/25',
  },
};

export function FocusBadge({ focus, className, size = 'sm' }: FocusBadgeProps) {
  if (!focus) return null;

  const config = FOCUS_CONFIG[focus];
  if (!config) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 font-medium',
        size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5',
        config.className,
        className,
      )}
    >
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </Badge>
  );
}

export function getFocusLabel(focus: TaskFocus | null | undefined): string {
  if (!focus) return '';
  return FOCUS_CONFIG[focus]?.label ?? '';
}