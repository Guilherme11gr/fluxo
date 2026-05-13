'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TaskFocus } from '@/shared/types';

interface FocusSelectorProps {
  value: TaskFocus | null;
  onChange: (value: TaskFocus | null) => void;
  className?: string;
}

const FOCUS_OPTIONS: { value: TaskFocus; label: string; emoji: string; activeClass: string }[] = [
  { value: 'TODAY', label: 'Hoje', emoji: '🔥', activeClass: 'bg-orange-500/20 text-orange-400 border-orange-500/50' },
  { value: 'THIS_WEEK', label: 'Esta Semana', emoji: '📅', activeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
];

export function FocusSelector({ value, onChange, className }: FocusSelectorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {FOCUS_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(isActive ? null : option.value)}
            className={cn(
              'h-8 text-xs gap-1.5 transition-all',
              isActive
                ? option.activeClass
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span>{option.emoji}</span>
            <span>{option.label}</span>
          </Button>
        );
      })}
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
          className="h-8 text-xs text-muted-foreground hover:text-destructive"
        >
          Limpar
        </Button>
      )}
    </div>
  );
}