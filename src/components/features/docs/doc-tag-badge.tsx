'use client';

import { X, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface DocTagBadgeProps {
    name: string;
    count?: number;
    onRemove?: () => void;
    onClick?: () => void;
    selected?: boolean;
    size?: 'sm' | 'default';
    className?: string;
}

/**
 * Tag badge component for displaying document tags.
 * Features:
 * - Optional remove button
 * - Optional click handler (for filtering)
 * - Optional document count
 * - Color variations based on name
 */
export function DocTagBadge({
    name,
    count,
    onRemove,
    onClick,
    selected = false,
    size = 'default',
    className,
}: DocTagBadgeProps) {
    // Generate consistent color based on tag name
    const colorIndex = Math.abs(hashCode(name)) % tagColors.length;
    const colors = tagColors[colorIndex];

    return (
        <Badge
            variant="outline"
            onClick={onClick}
            className={cn(
                'gap-1 transition-all',
                size === 'sm' ? 'text-[10px] px-1.5 py-0' : 'text-xs px-2 py-0.5',
                onClick && 'cursor-pointer hover:scale-105',
                selected ? colors.selected : colors.default,
                className
            )}
        >
            <Tag className={cn('shrink-0', size === 'sm' ? 'size-2.5' : 'size-3')} />
            <span className="truncate max-w-[120px]">{name}</span>
            {count !== undefined && (
                <span className="text-muted-foreground ml-0.5">({count})</span>
            )}
            {onRemove && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                    className={cn(
                        'ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 transition-colors',
                        size === 'sm' ? '-mr-0.5' : ''
                    )}
                >
                    <X className={cn(size === 'sm' ? 'size-2.5' : 'size-3')} />
                </button>
            )}
        </Badge>
    );
}

// Simple hash function for consistent colors
function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

// Predefined color combinations
const tagColors = [
    { default: 'border-blue-500/50 text-blue-600 dark:text-blue-400', selected: 'bg-blue-500/20 border-blue-500' },
    { default: 'border-purple-500/50 text-purple-600 dark:text-purple-400', selected: 'bg-purple-500/20 border-purple-500' },
    { default: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400', selected: 'bg-emerald-500/20 border-emerald-500' },
    { default: 'border-orange-500/50 text-orange-600 dark:text-orange-400', selected: 'bg-orange-500/20 border-orange-500' },
    { default: 'border-pink-500/50 text-pink-600 dark:text-pink-400', selected: 'bg-pink-500/20 border-pink-500' },
    { default: 'border-cyan-500/50 text-cyan-600 dark:text-cyan-400', selected: 'bg-cyan-500/20 border-cyan-500' },
    { default: 'border-amber-500/50 text-amber-600 dark:text-amber-400', selected: 'bg-amber-500/20 border-amber-500' },
    { default: 'border-rose-500/50 text-rose-600 dark:text-rose-400', selected: 'bg-rose-500/20 border-rose-500' },
];
