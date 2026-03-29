import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

// ============================================
// Types
// ============================================

interface ImproveDescriptionInput {
    taskId: string;
    includeProjectDocs?: boolean;
    docIds?: string[];
}

interface GenerateDescriptionInput {
    title: string;
    featureId: string;
    currentDescription?: string;
    type?: 'TASK' | 'BUG';
    priority?: string;
    includeProjectDocs?: boolean;
    docIds?: string[];
    projectId?: string;
}

interface AIDescriptionResponse {
    description: string;
    taskId?: string;
}

// ============================================
// Hooks
// ============================================

/**
 * Hook para melhorar descrição de task existente
 * Usa o contexto da task e feature para gerar descrição melhorada
 */
export function useImproveDescription() {
    return useMutation({
        mutationFn: async (input: ImproveDescriptionInput): Promise<AIDescriptionResponse> => {
            const response = await fetch('/api/ai/improve-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error?.message || 'Erro ao melhorar descrição');
            }

            const json = await response.json();
            return json.data as AIDescriptionResponse;
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

/**
 * Hook para gerar descrição para nova task (sem taskId)
 * Usa contexto inline passado pelo frontend
 */
export function useGenerateDescription() {
    return useMutation({
        mutationFn: async (input: GenerateDescriptionInput): Promise<AIDescriptionResponse> => {
            const response = await fetch('/api/ai/generate-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error?.message || 'Erro ao gerar descrição');
            }

            const json = await response.json();
            return json.data as AIDescriptionResponse;
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

// ============================================
// Suggest Tasks Hook
// ============================================

interface SuggestTasksInput {
    featureId: string;
    includeProjectDocs?: boolean;
}

interface SuggestedTask {
    title: string;
    description: string;
    complexity: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface SuggestTasksResponse {
    suggestions: SuggestedTask[];
    featureId: string;
}

/**
 * Hook para sugerir tasks baseado em uma feature
 * Usa IA para analisar a feature e gerar sugestões
 */
export function useSuggestTasks() {
    return useMutation({
        mutationFn: async (input: SuggestTasksInput): Promise<SuggestTasksResponse> => {
            const response = await fetch('/api/ai/suggest-tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error?.message || 'Erro ao gerar sugestões de tasks');
            }

            const json = await response.json();
            return json.data as SuggestTasksResponse;
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}

// Re-export types for convenience
export type { SuggestedTask, SuggestTasksResponse };

// ============================================
// Improve Feature Description Hook
// ============================================

interface ImproveFeatureDescriptionInput {
    featureId?: string;
    title: string;
    description?: string;
    epicId?: string;
    includeProjectDocs?: boolean;
    docIds?: string[];
}

interface ImproveFeatureDescriptionResponse {
    description: string;
    featureId: string | null;
}

/**
 * Hook para melhorar/gerar descrição de feature
 * Usa IA para criar descrição estruturada em markdown
 */
export function useImproveFeatureDescription() {
    return useMutation({
        mutationFn: async (input: ImproveFeatureDescriptionInput): Promise<ImproveFeatureDescriptionResponse> => {
            const response = await fetch('/api/ai/improve-feature-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error?.message || 'Erro ao melhorar descrição da feature');
            }

            const json = await response.json();
            return json.data as ImproveFeatureDescriptionResponse;
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}
// ============================================
// Generate Epic Summary Hook
// ============================================

interface GenerateEpicSummaryInput {
    epicId: string;
}

interface GenerateEpicSummaryResponse {
    summary: string;
    lastAnalyzedAt: Date;
}

/**
 * Hook para gerar Resumo Executivo de Épico com IA
 */
export function useGenerateEpicSummary() {
    return useMutation({
        mutationFn: async (input: GenerateEpicSummaryInput): Promise<GenerateEpicSummaryResponse> => {
            const response = await fetch('/api/ai/generate-epic-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error?.error?.message || 'Erro ao gerar resumo do épico');
            }

            return await response.json();
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });
}
