import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, ChevronDown } from "lucide-react";
import { MarkdownViewer } from "@/components/ui/markdown-viewer";
import { toast } from "sonner";
import { useGenerateEpicSummary } from "@/lib/query";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EpicAISummaryCardProps {
    epicId: string;
    initialSummary?: string | null;
    lastAnalyzedAt?: Date | string | null;
}

export function EpicAISummaryCard({
    epicId,
    initialSummary,
    lastAnalyzedAt
}: EpicAISummaryCardProps) {
    const [summary, setSummary] = useState<string | null>(initialSummary || null);
    const [analyzedAt, setAnalyzedAt] = useState<Date | null>(
        lastAnalyzedAt ? new Date(lastAnalyzedAt) : null
    );
    const [isExpanded, setIsExpanded] = useState(false);

    const generateMutation = useGenerateEpicSummary();
    const isLoading = generateMutation.isPending;

    const handleRefresh = async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const result = await generateMutation.mutateAsync({ epicId });
            setSummary(result.summary);
            setAnalyzedAt(new Date(result.lastAnalyzedAt));
            if (!isExpanded) setIsExpanded(true); // Auto-expand when refreshing
            toast.success("Análise atualizada com sucesso!");
        } catch {
            toast.error("Falha ao atualizar a análise.");
        }
    };

    if (!summary && !isLoading) {
        return (
            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/50 dark:bg-violet-900/10 p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-full text-violet-600">
                        <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-violet-900 dark:text-violet-100">
                            Nenhuma análise disponível
                        </h3>
                        <p className="text-sm text-violet-600/80 dark:text-violet-300/80">
                            Gere um resumo executivo com IA para ter uma visão rápida do épico.
                        </p>
                    </div>
                </div>
                <Button
                    onClick={handleRefresh}
                    variant="outline"
                    className="border-violet-200 hover:bg-violet-100 text-violet-700 dark:border-violet-800 dark:hover:bg-violet-900/50 dark:text-violet-300"
                >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Gerar Análise
                </Button>
            </div>
        );
    }

    return (
        <div className="group relative rounded-lg border border-border/40 shadow-sm transition-all hover:bg-muted/5">
            {/* Header / Info Status */}
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-transparent"
                    >
                        <ChevronDown
                            className={cn(
                                "w-4 h-4 transition-transform duration-200",
                                !isExpanded && "-rotate-90"
                            )}
                        />
                    </Button>
                    <Sparkles className="w-4 h-4 text-violet-500" />
                    <span className="font-medium text-foreground">Executive Briefing</span>
                    <span className="text-xs text-muted-foreground/60">•</span>
                    <span className="text-xs">
                        {isLoading ? "Atualizando..." : analyzedAt
                            ? `Gerado ${formatDistanceToNow(analyzedAt, { addSuffix: true, locale: ptBR })}`
                            : ""
                        }
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isLoading}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground z-10"
                    title="Atualizar análise"
                >
                    <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                </Button>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    {isLoading ? (
                        <div className="space-y-4 animate-pulse">
                            <div className="h-4 bg-muted rounded w-3/4" />
                            <div className="h-4 bg-muted rounded w-1/2" />
                            <div className="h-20 bg-muted/50 rounded w-full mt-4" />
                        </div>
                    ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground prose-headings:font-semibold prose-headings:text-foreground prose-p:leading-relaxed prose-strong:text-foreground">
                            <MarkdownViewer value={summary || ""} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
