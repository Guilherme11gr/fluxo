'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSuggestTasks, useCreateTask, type SuggestedTask } from '@/lib/query';
import { toast } from 'sonner';

interface SuggestTasksModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    featureId: string;
    featureTitle: string;
    projectId: string;
    onSuccess?: () => void;
}

const COMPLEXITY_STYLES = {
    LOW: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    MEDIUM: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    HIGH: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const COMPLEXITY_LABELS = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
};

interface SuggestionItemProps {
    suggestion: SuggestedTask;
    selected: boolean;
    onToggle: () => void;
    expanded: boolean;
    onExpandToggle: () => void;
}

function SuggestionItem({ suggestion, selected, onToggle, expanded, onExpandToggle }: SuggestionItemProps) {
    return (
        <div className={cn(
            "border rounded-lg p-4 transition-all",
            selected ? "border-violet-300 bg-violet-50/50 dark:border-violet-700 dark:bg-violet-900/20" : "border-gray-200 dark:border-gray-700"
        )}>
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggle}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-sm">{suggestion.title}</span>
                        <Badge className={cn("text-xs", COMPLEXITY_STYLES[suggestion.complexity])}>
                            {COMPLEXITY_LABELS[suggestion.complexity]}
                        </Badge>
                    </div>
                    {suggestion.description && (
                        <>
                            <button
                                type="button"
                                onClick={onExpandToggle}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
                            >
                                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                {expanded ? 'Ocultar descrição' : 'Ver descrição'}
                            </button>
                            {expanded && (
                                <div className="mt-2 text-sm text-muted-foreground bg-muted/50 rounded p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                    {suggestion.description}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export function SuggestTasksModal({
    open,
    onOpenChange,
    featureId,
    featureTitle,
    projectId,
    onSuccess,
}: SuggestTasksModalProps) {
    const [suggestions, setSuggestions] = useState<SuggestedTask[]>([]);
    const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
    const [expandedIndexes, setExpandedIndexes] = useState<Set<number>>(new Set());
    const [includeProjectDocs, setIncludeProjectDocs] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const suggestMutation = useSuggestTasks();
    const createTaskMutation = useCreateTask();

    const isGenerating = suggestMutation.isPending;
    const hasSuggestions = suggestions.length > 0;

    const handleGenerate = useCallback(async () => {
        setSuggestions([]);
        setSelectedIndexes(new Set());
        setExpandedIndexes(new Set());

        try {
            const result = await suggestMutation.mutateAsync({
                featureId,
                includeProjectDocs,
            });
            setSuggestions(result.suggestions);
            // Select all by default
            setSelectedIndexes(new Set(result.suggestions.map((_, i) => i)));
        } catch {
            // Error handled by hook
        }
    }, [featureId, includeProjectDocs, suggestMutation]);

    const toggleSelection = useCallback((index: number) => {
        setSelectedIndexes(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    }, []);

    const toggleExpanded = useCallback((index: number) => {
        setExpandedIndexes(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIndexes(new Set(suggestions.map((_, i) => i)));
    }, [suggestions]);

    const deselectAll = useCallback(() => {
        setSelectedIndexes(new Set());
    }, []);

    const handleCreateSelected = useCallback(async () => {
        const selected = suggestions.filter((_, i) => selectedIndexes.has(i));
        if (selected.length === 0) {
            toast.error('Selecione ao menos uma task');
            return;
        }

        setIsCreating(true);
        let created = 0;

        try {
            for (const suggestion of selected) {
                await createTaskMutation.mutateAsync({
                    title: suggestion.title,
                    description: suggestion.description,
                    type: 'TASK',
                    priority: suggestion.complexity === 'HIGH' ? 'HIGH' : suggestion.complexity === 'LOW' ? 'LOW' : 'MEDIUM',
                    status: 'BACKLOG',
                    featureId,
                    projectId,
                    modules: [],
                    points: null,
                });
                created++;
            }

            toast.success(`${created} task${created > 1 ? 's' : ''} criada${created > 1 ? 's' : ''} com sucesso!`);
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            if (created > 0) {
                toast.warning(`${created} de ${selected.length} tasks criadas antes do erro`);
            }
            // Error toast handled by mutation
        } finally {
            setIsCreating(false);
        }
    }, [suggestions, selectedIndexes, createTaskMutation, featureId, projectId, onOpenChange, onSuccess]);

    const handleClose = useCallback((open: boolean) => {
        if (!open) {
            setSuggestions([]);
            setSelectedIndexes(new Set());
            setExpandedIndexes(new Set());
        }
        onOpenChange(open);
    }, [onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="z-modal max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-violet-500" />
                        Sugerir Tasks com IA
                    </DialogTitle>
                    <DialogDescription>
                        Analisando: <strong>{featureTitle}</strong>
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden">
                    {/* Generate Button / Include docs option */}
                    {!hasSuggestions && !isGenerating && (
                        <div className="space-y-4 py-8">
                            <p className="text-center text-muted-foreground">
                                A IA irá analisar a descrição da feature e sugerir tasks para implementá-la.
                            </p>
                            <div className="flex justify-center">
                                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={includeProjectDocs}
                                        onChange={(e) => setIncludeProjectDocs(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                                    />
                                    Incluir documentação do projeto como contexto
                                </label>
                            </div>
                            <div className="flex justify-center">
                                <Button onClick={handleGenerate} className="gap-2">
                                    <Sparkles className="w-4 h-4" />
                                    Gerar Sugestões
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Loading State */}
                    {isGenerating && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                            <p className="text-muted-foreground">Analisando feature e gerando sugestões...</p>
                        </div>
                    )}

                    {/* Suggestions List */}
                    {hasSuggestions && !isGenerating && (
                        <>
                            <div className="flex items-center justify-between flex-shrink-0">
                                <span className="text-sm text-muted-foreground">
                                    {selectedIndexes.size} de {suggestions.length} selecionadas
                                </span>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={selectAll}>
                                        Selecionar todas
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={deselectAll}>
                                        Limpar seleção
                                    </Button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto -mx-6 px-6">
                                <div className="space-y-3 pb-4">
                                    {suggestions.map((suggestion, index) => (
                                        <SuggestionItem
                                            key={index}
                                            suggestion={suggestion}
                                            selected={selectedIndexes.has(index)}
                                            onToggle={() => toggleSelection(index)}
                                            expanded={expandedIndexes.has(index)}
                                            onExpandToggle={() => toggleExpanded(index)}
                                        />
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="gap-2 sm:gap-0 flex-shrink-0">
                    {hasSuggestions && !isGenerating && (
                        <Button
                            variant="outline"
                            onClick={handleGenerate}
                            disabled={isCreating}
                        >
                            Gerar novamente
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        onClick={() => handleClose(false)}
                        disabled={isCreating || isGenerating}
                    >
                        Cancelar
                    </Button>
                    {hasSuggestions && !isGenerating && (
                        <Button
                            onClick={handleCreateSelected}
                            disabled={selectedIndexes.size === 0 || isCreating}
                            className="gap-2"
                        >
                            {isCreating ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Criando...
                                </>
                            ) : (
                                `Criar ${selectedIndexes.size} Task${selectedIndexes.size !== 1 ? 's' : ''}`
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
