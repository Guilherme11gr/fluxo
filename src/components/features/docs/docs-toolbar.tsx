'use client';

import { Search, X, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DocTag } from '@/lib/query/hooks/use-doc-tags';

interface DocsToolbarProps {
    search: string;
    onSearchChange: (value: string) => void;
    tags: DocTag[];
    selectedTagIds: string[];
    onTagSelect: (tagId: string) => void;
    onClearTags?: () => void;
    className?: string;
}

export function DocsToolbar({
    search,
    onSearchChange,
    tags,
    selectedTagIds,
    onTagSelect,
    onClearTags,
    className
}: DocsToolbarProps) {
    return (
        <div className={cn("space-y-4", className)}>
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                {/* Search Input */}
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar documentos..."
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-9 h-9 bg-background/50"
                    />
                    {search && (
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Horizontal Tags Scroll */}
            {tags.length > 0 && (
                <div className="relative -mx-1 px-1">
                    {/* Fade gradient on right */}
                    {tags.length > 5 && (
                        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
                    )}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                        <div className="flex items-center gap-2 pr-4">
                            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap mr-2 flex items-center gap-1.5">
                                <Filter className="h-3 w-3" />
                                Filtrar por:
                            </span>

                            {tags.map((tag) => {
                                const isSelected = selectedTagIds.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        onClick={() => onTagSelect(tag.id)}
                                        className={cn(
                                            "h-7 px-3 rounded-full text-xs font-medium transition-all duration-200 border whitespace-nowrap select-none flex items-center gap-1.5 max-w-[200px]",
                                            isSelected
                                                ? "bg-primary text-primary-foreground border-primary shadow-sm hover:bg-primary/90"
                                                : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground hover:bg-accent/50"
                                        )}
                                        title={tag.name}
                                    >
                                        <span className="truncate">{tag.name}</span>
                                        {isSelected && <X className="h-3 w-3 ml-0.5 flex-shrink-0" />}
                                    </button>
                                );
                            })}

                            {selectedTagIds.length > 0 && (
                                <div className="h-4 w-px bg-border mx-1" />
                            )}

                            {selectedTagIds.length > 0 && (
                                <button
                                    onClick={() => {
                                        if (onClearTags) {
                                            onClearTags();
                                        } else {
                                            // Fallback: deselect each tag individually
                                            selectedTagIds.forEach(tagId => onTagSelect(tagId));
                                        }
                                    }}
                                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap"
                                >
                                    Limpar
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
