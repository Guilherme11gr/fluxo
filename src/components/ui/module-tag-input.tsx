'use client';

import { useState, useRef, useCallback, KeyboardEvent } from 'react';
import { X, Plus, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ModuleTagInputProps {
    value: string[];
    onChange: (modules: string[]) => void;
    availableModules?: string[];
    placeholder?: string;
    disabled?: boolean;
    maxModules?: number;
    className?: string;
}

/**
 * Modern tag input for selecting multiple modules.
 * Features:
 * - Autocomplete from available modules
 * - Add new modules on Enter or comma
 * - Remove with X button or Backspace
 * - Visual badges for selected modules
 */
export function ModuleTagInput({
    value = [],
    onChange,
    availableModules = [],
    placeholder = 'Adicionar módulo...',
    disabled = false,
    maxModules = 10,
    className,
}: ModuleTagInputProps) {
    const [inputValue, setInputValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter suggestions based on input and exclude already selected
    const filteredSuggestions = availableModules.filter(
        (mod) =>
            mod.toLowerCase().includes(inputValue.toLowerCase()) &&
            !value.includes(mod)
    );

    const addModule = useCallback(
        (module: string) => {
            const trimmed = module.trim();
            if (!trimmed) return;
            if (value.includes(trimmed)) return;
            if (value.length >= maxModules) return;

            onChange([...value, trimmed]);
            setInputValue('');
            setShowSuggestions(false);
        },
        [value, onChange, maxModules]
    );

    const removeModule = useCallback(
        (moduleToRemove: string) => {
            onChange(value.filter((m) => m !== moduleToRemove));
        },
        [value, onChange]
    );

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            if (inputValue.trim()) {
                addModule(inputValue);
            }
        } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
            removeModule(value[value.length - 1]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
            inputRef.current?.blur();
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        setShowSuggestions(true);
    };

    const handleFocus = () => {
        setIsFocused(true);
        setShowSuggestions(true);
    };

    const handleBlur = () => {
        setIsFocused(false);
        // Delay hiding suggestions to allow click
        setTimeout(() => setShowSuggestions(false), 150);
    };

    const handleContainerClick = () => {
        inputRef.current?.focus();
    };

    return (
        <div className={cn('relative', className)}>
            {/* Main Input Container */}
            <div
                ref={containerRef}
                onClick={handleContainerClick}
                className={cn(
                    'flex flex-wrap items-center gap-1.5 min-h-[42px] p-2 rounded-lg border bg-background cursor-text transition-all',
                    isFocused && 'ring-2 ring-ring/20 border-primary',
                    disabled && 'opacity-50 cursor-not-allowed',
                    !disabled && 'hover:border-muted-foreground/50'
                )}
            >
                {/* Module Icon - only show when empty */}
                {value.length === 0 && !inputValue && (
                    <Layers className="w-4 h-4 text-muted-foreground/50 ml-1" />
                )}

                {/* Selected Module Tags */}
                {value.map((mod) => (
                    <Badge
                        key={mod}
                        variant="secondary"
                        className="gap-1 pl-2 pr-1 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                        {mod}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                removeModule(mod);
                            }}
                            disabled={disabled}
                            className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20 transition-colors"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </Badge>
                ))}

                {/* Text Input */}
                {value.length < maxModules && (
                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        placeholder={value.length === 0 ? placeholder : ''}
                        disabled={disabled}
                        className={cn(
                            'flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground/50',
                            disabled && 'cursor-not-allowed'
                        )}
                    />
                )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && filteredSuggestions.length > 0 && !disabled && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 p-1 rounded-lg border bg-popover shadow-lg animate-in fade-in-0 zoom-in-95 duration-100">
                    <div className="text-[10px] text-muted-foreground px-2 py-1 font-medium uppercase tracking-wider">
                        Sugestões
                    </div>
                    {filteredSuggestions.slice(0, 6).map((suggestion) => (
                        <button
                            key={suggestion}
                            type="button"
                            onClick={() => addModule(suggestion)}
                            className="w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
                        >
                            <Plus className="w-3 h-3 text-muted-foreground" />
                            {suggestion}
                        </button>
                    ))}
                </div>
            )}

            {/* Helper Text */}
            <p className="text-[10px] text-muted-foreground mt-1.5 ml-1">
                {value.length}/{maxModules} módulos • Enter ou vírgula para adicionar
            </p>
        </div>
    );
}
