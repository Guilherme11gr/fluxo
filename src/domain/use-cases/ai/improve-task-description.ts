import type { TaskWithReadableId } from '@/shared/types';
import type { AIAdapter } from '@/infra/adapters/ai';
import { buildTaskDescriptionContext } from './context';
import { buildImproveDescriptionPrompt } from './prompts';
import { filterRelevantContext } from './filter-relevant-context';
import { AI_TEMPERATURE_CREATIVE, AI_MAX_TOKENS_TASK } from '@/config/ai.config';

export interface ImproveTaskDescriptionInput {
    task: TaskWithReadableId;
    featureDescription?: string | null;
    projectDocs?: Array<{ title: string; content: string }>;
}

export interface ImproveTaskDescriptionDeps {
    aiAdapter: AIAdapter;
}

/**
 * Improve Task Description Use Case
 * 
 * Uses AI to generate an improved task description
 * based on the task context and parent feature.
 * 
 * Two-Stage Pipeline:
 * 1. Filter relevant docs with DeepSeek Chat (fast/cheap)
 * 2. Generate with DeepSeek Reasoner (smart/expensive)
 * 
 * @example
 * ```typescript
 * const improved = await improveTaskDescription(
 *   { task, featureDescription: feature.description },
 *   { aiAdapter }
 * );
 * ```
 */
export async function improveTaskDescription(
    input: ImproveTaskDescriptionInput,
    deps: ImproveTaskDescriptionDeps
): Promise<string> {
    return await improveTaskDescriptionV2(input, deps);
}

/**
 * V2: Two-stage pipeline
 * FASE 1: Filter context (Chat) → FASE 2: Generate (Reasoner)
 */
async function improveTaskDescriptionV2(
    input: ImproveTaskDescriptionInput,
    deps: ImproveTaskDescriptionDeps
): Promise<string> {
    const { aiAdapter } = deps;

    // FASE 1: Filter relevant context with Chat (fast/cheap)
    // Uses default maxDocsToInclude from config (AI_MAX_DOCS_TO_INCLUDE)
    const { cleanedContext } = await filterRelevantContext(
        {
            objective: `Melhorar descrição da task "${input.task.title}"`,
            allDocs: input.projectDocs,
            featureContext: input.featureDescription,
            // maxDocsToInclude uses default from config
        },
        { aiAdapter }
    );

    // Build system prompt
    const context = buildTaskDescriptionContext(
        input.task,
        input.featureDescription,
        input.projectDocs
    );
    const { systemPrompt } = buildImproveDescriptionPrompt(context);

    // FASE 2: Generate with Reasoner (smart/expensive)
    const result = await aiAdapter.reasonerCompletion({
        objective: `Melhorar a descrição da task "${input.task.title}" (tipo: ${input.task.type}, prioridade: ${input.task.priority})`,
        context: cleanedContext || 'Nenhum contexto adicional disponível.',
        systemPrompt,
        temperature: AI_TEMPERATURE_CREATIVE,
        maxTokens: AI_MAX_TOKENS_TASK,
    });

    return result.content.trim();
}
