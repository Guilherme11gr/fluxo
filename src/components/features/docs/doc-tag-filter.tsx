'use client';

import { useState } from 'react';
import { Filter, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocTagBadge } from './doc-tag-badge';
import { cn } from '@/lib/utils';
import type { DocTag } from '@/lib/query/hooks/use-doc-tags';

interface DocTagFilterProps {
    tags: DocTag[];
    selectedTagIds: string[];
    onSelectionChange: (tagIds: string[]) => void;
    isLoading?: boolean;
    className?: string;
}

/**
 * Multi-select filter for filtering documents by tags.
 * Features:
 * - Shows selected tags as badges
 * - Dropdown for selecting additional tags
 * - Clear all button
 */
export function DocTagFilter({
    tags,
    selectedTagIds,
    onSelectionChange,
    isLoading = false,
    className,
}: DocTagFilterProps) {
    const [isOpen, setIsOpen] = useState(false);

    const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id));
    const availableTags = tags.filter((t) => !selectedTagIds.includes(t.id));

    const toggleTag = (tagId: string) => {
        if (selectedTagIds.includes(tagId)) {
            onSelectionChange(selectedTagIds.filter((id) => id !== tagId));
        } else {
            onSelectionChange([...selectedTagIds, tagId]);
        }
    };

    const clearAll = () => {
        onSelectionChange([]);
    };

    if (tags.length === 0 && !isLoading) {
        return null;
    }

    return (
        <div className={cn('relative', className)}>
            {/* Filter Bar */}
            <div className="flex items-center gap-2 flex-wrap">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsOpen(!isOpen)}
                    className="gap-2 text-muted-foreground"
                >
                    <Filter className="size-3.5" />
                    Filtrar por tag
                    <ChevronDown className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')} />
                </Button>

                {/* Selected Tags */}
                {selectedTags.map((tag) => (
                    <DocTagBadge
                        key={tag.id}
                        name={tag.name}
                        selected
                        onRemove={() => toggleTag(tag.id)}
                        size="sm"
                    />
                ))}

                {/* Clear All */}
                {selectedTagIds.length > 0 && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAll}
                        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <X className="size-3 mr-1" />
                        Limpar
                    </Button>
                )}
            </div>

            {/* Dropdown */}
            {isOpen && availableTags.length > 0 && (
                <div className="absolute z-50 top-full left-0 mt-2 p-2 rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 duration-100 min-w-[200px]">
                    <div className="text-[10px] text-muted-foreground px-2 py-1 font-medium uppercase tracking-wider">
                        Tags disponíveis
                    </div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1">
                        {availableTags.map((tag) => (
                            <button
                                key={tag.id}
                                type="button"
                                onClick={() => {
                                    toggleTag(tag.id);
                                    setIsOpen(false);
                                }}
                                className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors flex items-center justify-between gap-2"
                            >
                                <span className="truncate">{tag.name}</span>
                                {tag._count && (
                                    <span className="text-xs text-muted-foreground">
                                        {tag._count.assignments}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Click outside to close */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}
