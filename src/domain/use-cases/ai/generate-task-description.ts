import type { TaskType, TaskPriority } from '@/shared/types';
import type { AIAdapter } from '@/infra/adapters/ai';
import type { Feature } from '@/shared/types';
import { filterRelevantContext } from './filter-relevant-context';
import { stripMarkdown } from '@/shared/utils/markdown-cleaner';
import { AI_TEMPERATURE_CREATIVE, AI_MAX_TOKENS_DESCRIPTION } from '@/config/ai.config';

export interface GenerateTaskDescriptionInput {
    title: string;
    type?: TaskType;
    priority?: TaskPriority;
    currentDescription?: string | null;
    feature: {
        title: string;
        description: string | null;
    };
    projectDocs?: Array<{ title: string; content: string }>;
}

export interface GenerateTaskDescriptionDeps {
    aiAdapter: AIAdapter;
}

const SYSTEM_PROMPT = `Atue como PO senior. Crie descrições de tarefas claras, técnicas e objetivas em PT-BR.
Use Markdown. Estruture em: ## Objetivo e ## Critérios de Aceite (checklist).
Seja conciso. Sem emojis. Evite preâmbulos.`;

const TYPE_LABELS: Record<string, string> = {
    TASK: 'Tarefa',
    BUG: 'Bug',
};

const PRIORITY_LABELS: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    CRITICAL: 'Crítica',
};

function buildPrompt(input: GenerateTaskDescriptionInput): string {
    const type = TYPE_LABELS[input.type || 'TASK'] || 'Tarefa';
    const priority = PRIORITY_LABELS[input.priority || 'MEDIUM'] || 'Média';
    const currentDesc = input.currentDescription?.trim();

    // Build project docs section if available
    const projectDocsSection = input.projectDocs?.length
        ? `
---

## Documentação do Projeto

${input.projectDocs.map(doc => `### ${doc.title}\n${doc.content}`).join('\n\n')}
`
        : '';

    let prompt = `CONTEXTO DA FEATURE:
"${input.feature.title}"
${input.feature.description || ''}
${projectDocsSection}

TAREFAS A DESCREVER:
Título: ${input.title}
Tipo: ${type}
Prioridade: ${priority}`;

    if (currentDesc) {
        prompt += `\n\nDESCRIÇÃO ATUAL (Melhorar/Refinar):\n${currentDesc}`;
    } else {
        prompt += `\n\nGere uma descrição completa com Objetivo e Critérios de Aceite via checklist.`;
    }

    return prompt;
}

/**
 * V1: Original single-stage approach (legacy)
 */
async function generateTaskDescriptionV1(
    input: GenerateTaskDescriptionInput,
    deps: GenerateTaskDescriptionDeps
): Promise<string> {
    const { aiAdapter } = deps;
    const userPrompt = buildPrompt(input);

    const result = await aiAdapter.chatCompletion({
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 1500,
    });

    return result.content.trim();
}

/**
 * V2: Two-stage approach (Chat filter → Reasoner generate)
 */
async function generateTaskDescriptionV2(
    input: GenerateTaskDescriptionInput,
    deps: GenerateTaskDescriptionDeps
): Promise<string> {
    const { aiAdapter } = deps;
    const type = TYPE_LABELS[input.type || 'TASK'] || 'Tarefa';
    const priority = PRIORITY_LABELS[input.priority || 'MEDIUM'] || 'Média';

    // FASE 1: Filter relevant docs (if any)
    let relevantContext = '';
    if (input.projectDocs?.length) {
        const featureContextClean = stripMarkdown(`
            Feature: ${input.feature.title}
            ${input.feature.description || ''}
        `);

        const objective = `Gerar descrição para tarefa "${input.title}" (Tipo: ${type}, Prioridade: ${priority})`;

        const filtered = await filterRelevantContext(
            {
                objective,
                allDocs: input.projectDocs,
                featureContext: featureContextClean,
            },
            { aiAdapter }
        );

        relevantContext = filtered.cleanedContext;
    }

    // FASE 2: Generate with Reasoner using filtered context
    const cleanFeature = stripMarkdown(input.feature.description || '');
    const cleanCurrentDesc = input.currentDescription ? stripMarkdown(input.currentDescription) : '';

    const reasonerInput = `
Gere descrição de tarefa:

TAREFA:
Título: ${input.title}
Tipo: ${type}
Prioridade: ${priority}
${cleanCurrentDesc ? `Descrição atual: ${cleanCurrentDesc}` : ''}

FEATURE:
${input.feature.title}
${cleanFeature}
`.trim();

    const result = await aiAdapter.reasonerCompletion({
        objective: reasonerInput,
        context: relevantContext,
        systemPrompt: SYSTEM_PROMPT,
        temperature: AI_TEMPERATURE_CREATIVE,
        maxTokens: AI_MAX_TOKENS_DESCRIPTION,
    });

    return result.content.trim();
}

/**
 * Streaming: Two-stage approach (Chat filter → Reasoner generate) with streaming
 * JKILL-224: Streaming version for real-time AI generation
 */
async function* generateTaskDescriptionWithStream(
    input: GenerateTaskDescriptionInput,
    deps: GenerateTaskDescriptionDeps
): AsyncGenerator<string> {
    const { aiAdapter } = deps;
    const type = TYPE_LABELS[input.type || 'TASK'] || 'Tarefa';
    const priority = PRIORITY_LABELS[input.priority || 'MEDIUM'] || 'Média';

    // FASE 1: Filter relevant docs (if any)
    let relevantContext = '';
    if (input.projectDocs?.length) {
        const featureContextClean = stripMarkdown(`
            Feature: ${input.feature.title}
            ${input.feature.description || ''}
        `);

        const objective = `Gerar descrição para tarefa "${input.title}" (Tipo: ${type}, Prioridade: ${priority})`;

        const filtered = await filterRelevantContext(
            {
                objective,
                allDocs: input.projectDocs,
                featureContext: featureContextClean,
            },
            { aiAdapter }
        );

        relevantContext = filtered.cleanedContext;
    }

    // FASE 2: Generate with Reasoner using filtered context (STREAMING)
    const cleanFeature = stripMarkdown(input.feature.description || '');
    const cleanCurrentDesc = input.currentDescription ? stripMarkdown(input.currentDescription) : '';

    const reasonerInput = `
Gere descrição de tarefa:

TAREFA:
Título: ${input.title}
Tipo: ${type}
Prioridade: ${priority}
${cleanCurrentDesc ? `Descrição atual: ${cleanCurrentDesc}` : ''}

FEATURE:
${input.feature.title}
${cleanFeature}
`.trim();

    const stream = aiAdapter.reasonerCompletionStream({
        objective: reasonerInput,
        context: relevantContext,
        systemPrompt: SYSTEM_PROMPT,
        temperature: AI_TEMPERATURE_CREATIVE,
        maxTokens: AI_MAX_TOKENS_DESCRIPTION,
    });

    for await (const chunk of stream) {
        yield chunk;
    }
}

/**
 * Generate Task Description Use Case
 *
 * Generates a new description for a task based on title and feature context.
 * Can also improve existing descriptions.
 *
 * Supports two-stage AI pipeline (filter → reasoner) when NEXT_PUBLIC_USE_TWO_STAGE_AI=true
 */
export async function generateTaskDescription(
    input: GenerateTaskDescriptionInput,
    deps: GenerateTaskDescriptionDeps
): Promise<string> {
    return generateTaskDescriptionV2(input, deps);
}

/**
 * JKILL-224: Generate Task Description with Streaming
 *
 * Returns an async generator that yields content chunks as they are generated.
 * Includes reasoning content from DeepSeek Reasoner formatted as blockquotes.
 *
 * @example
 * const stream = await generateTaskDescriptionStream(input, deps);
 * for await (const chunk of stream) {
 *   console.log(chunk); // Each chunk is a piece of the description
 * }
 */
export async function generateTaskDescriptionStream(
    input: GenerateTaskDescriptionInput,
    deps: GenerateTaskDescriptionDeps
): Promise<AsyncGenerator<string>> {
    return generateTaskDescriptionWithStream(input, deps);
}
