'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { Plus, Tag } from 'lucide-react';
import { DocTagBadge } from './doc-tag-badge';
import { cn } from '@/lib/utils';
import type { DocTag } from '@/lib/query/hooks/use-doc-tags';

interface DocTagInputProps {
    /** Currently assigned tags */
    value: DocTag[];
    /** Available project tags to suggest */
    availableTags: DocTag[];
    /** Called when a tag is added */
    onAdd: (tagId: string) => void;
    /** Called when a tag is removed */
    onRemove: (tagId: string) => void;
    /** Is the input disabled */
    disabled?: boolean;
    /** Loading state */
    isLoading?: boolean;
    /** Placeholder text */
    placeholder?: string;
    className?: string;
}

/**
 * Tag input component for adding/removing tags on a document.
 * Features:
 * - Typeahead suggestions from project tags
 * - Prevents duplicate assignments
 * - Remove tags with X button
 */
export function DocTagInput({
    value = [],
    availableTags,
    onAdd,
    onRemove,
    disabled = false,
    isLoading = false,
    placeholder = 'Adicionar tag...',
    className,
}: DocTagInputProps) {
    const [inputValue, setInputValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Filter suggestions - exclude already assigned and match input
    const assignedIds = new Set(value.map((t) => t.id));
    const filteredSuggestions = availableTags.filter(
        (tag) =>
            !assignedIds.has(tag.id) &&
            tag.name.toLowerCase().includes(inputValue.toLowerCase())
    );

    const handleSelectTag = (tagId: string) => {
        onAdd(tagId);
        setInputValue('');
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            setShowSuggestions(false);
            inputRef.current?.blur();
        } else if (e.key === 'Enter' && filteredSuggestions.length > 0) {
            e.preventDefault();
            handleSelectTag(filteredSuggestions[0].id);
        }
    };

    const handleFocus = () => {
        setIsFocused(true);
        setShowSuggestions(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
        setTimeout(() => setShowSuggestions(false), 150);
    };

    return (
        <div className={cn('relative', className)}>
            {/* Main Container */}
            <div
                onClick={() => inputRef.current?.focus()}
                className={cn(
                    'flex flex-wrap items-center gap-1.5 min-h-[38px] p-2 rounded-lg border bg-background cursor-text transition-all',
                    isFocused && 'ring-2 ring-ring/20 border-primary',
                    disabled && 'opacity-50 cursor-not-allowed',
                    !disabled && 'hover:border-muted-foreground/50'
                )}
            >
                {/* Tag Icon when empty */}
                {value.length === 0 && !inputValue && (
                    <Tag className="w-4 h-4 text-muted-foreground/50 ml-1" />
                )}

                {/* Current Tags */}
                {value.map((tag) => (
                    <DocTagBadge
                        key={tag.id}
                        name={tag.name}
                        onRemove={() => onRemove(tag.id)}
                        size="sm"
                    />
                ))}

                {/* Input */}
                {!disabled && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setShowSuggestions(true);
                        }}
                        onKeyDown={handleKeyDown}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        placeholder={value.length === 0 ? placeholder : ''}
                        disabled={disabled}
                        className="flex-1 min-w-[100px] bg-transparent outline-none text-sm placeholder:text-muted-foreground/50"
                    />
                )}

                {isLoading && (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && !disabled && (inputValue || isFocused) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 p-1 rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 duration-100">
                    <div className="text-[10px] text-muted-foreground px-2 py-1 font-medium uppercase tracking-wider">
                        {inputValue ? 'Resultados' : 'Sugestões'}
                    </div>
                    <div className="max-h-[150px] overflow-y-auto">
                        {filteredSuggestions.slice(0, 8).map((tag) => (
                            <button
                                key={tag.id}
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault(); // Prevent blur
                                    handleSelectTag(tag.id);
                                }}
                                className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors flex items-center gap-2"
                            >
                                <Plus className="w-3 h-3 text-muted-foreground" />
                                {tag.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* No suggestions message */}
            {showSuggestions && inputValue && filteredSuggestions.length === 0 && !disabled && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 p-3 rounded-lg border bg-popover shadow-lg text-sm text-muted-foreground text-center">
                    Nenhuma tag encontrada
                </div>
            )}
        </div>
    );
}
