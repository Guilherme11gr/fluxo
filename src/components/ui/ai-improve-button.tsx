'use client';

import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AIImproveButtonProps {
    onClick: () => void;
    isLoading?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'ghost' | 'outline';
    size?: 'default' | 'sm' | 'icon';
    className?: string;
    /** Label do botão - muda baseado no contexto */
    label?: string;
    /** Tooltip/title do botão */
    title?: string;
}

/**
 * Botão de IA reutilizável com visual premium
 * Usado para gerar/melhorar conteúdo com IA
 */
export function AIImproveButton({
    onClick,
    isLoading = false,
    disabled = false,
    variant = 'ghost',
    size = 'sm',
    className,
    label = 'Gerar com IA',
    title = 'Usar IA para gerar ou melhorar o conteúdo',
}: AIImproveButtonProps) {
    return (
        <Button
            type="button"
            variant={variant}
            size={size}
            onClick={onClick}
            disabled={disabled || isLoading}
            title={title}
            className={cn(
                'gap-1.5 text-xs font-medium transition-all',
                // Estilo violeta/roxo para IA
                'text-violet-600 hover:text-violet-700 hover:bg-violet-50',
                'dark:text-violet-400 dark:hover:text-violet-300 dark:hover:bg-violet-950/50',
                // Border sutil
                'border border-transparent hover:border-violet-200 dark:hover:border-violet-800',
                // Efeito shimmer sutil quando não loading
                !isLoading && 'hover:shadow-sm hover:shadow-violet-200/50 dark:hover:shadow-violet-900/30',
                className
            )}
        >
            {isLoading ? (
                <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Gerando...</span>
                </>
            ) : (
                <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{label}</span>
                </>
            )}
        </Button>
    );
}
