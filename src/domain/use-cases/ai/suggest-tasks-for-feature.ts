import type { AIAdapter } from '@/infra/adapters/ai';
import { filterRelevantContext } from './filter-relevant-context';
import { stripMarkdown } from '@/shared/utils/markdown-cleaner';
import { AI_TEMPERATURE_CREATIVE } from '@/config/ai.config';

// ============================================
// Types
// ============================================

export interface SuggestedTask {
    title: string;
    description: string;
    complexity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SuggestTasksInput {
    feature: {
        title: string;
        description: string | null;
        status: string;
    };
    epic?: {
        title: string;
        description: string | null;
    } | null;
    projectDocs?: Array<{ title: string; content: string }>;
}

export interface SuggestTasksDeps {
    aiAdapter: AIAdapter;
}

// ============================================
// Prompt Templates
// ============================================

const SYSTEM_PROMPT = `Você é um Product Manager técnico especializado em decomposição de features em tasks acionáveis.

Seu papel é analisar uma Feature e gerar sugestões de Tasks filhas bem estruturadas.

Diretrizes:
- Gere entre 3 e 8 tasks relevantes
- Cada task deve ser acionável e específica
- Evite tasks muito genéricas como "Implementar feature"
- Considere aspectos técnicos, de UX e de qualidade
- Inclua tasks de setup/preparação quando necessário
- Considere testes e documentação quando relevante
- Escreva em português brasileiro
- Retorne APENAS o JSON, sem markdown code blocks

Formato de resposta (JSON válido):
{
  "tasks": [
    {
      "title": "Título claro e conciso",
      "description": "## Objetivo\\n\\nDescrição do que deve ser feito.\\n\\n## Critérios de Aceite\\n\\n- [ ] Critério 1\\n- [ ] Critério 2",
      "complexity": "LOW" | "MEDIUM" | "HIGH"
    }
  ]
}`;

function buildUserPrompt(input: SuggestTasksInput): string {
    const epicSection = input.epic
        ? `## Epic Pai

**Título:** ${input.epic.title}
${input.epic.description || '(sem descrição)'}

---

`
        : '';

    const docsSection = input.projectDocs?.length
        ? `## Documentação do Projeto

${input.projectDocs.map(doc => `### ${doc.title}\n${doc.content}`).join('\n\n')}

---

`
        : '';

    return `${epicSection}${docsSection}## Feature a ser decomposta

**Título:** ${input.feature.title}
**Status:** ${input.feature.status}

**Descrição:**
${input.feature.description || '(sem descrição - sugira tasks baseado apenas no título)'}

---

Analise esta Feature e sugira Tasks filhas para implementá-la.
Considere todos os aspectos necessários: frontend, backend, testes, etc.

Retorne APENAS o JSON válido conforme o formato especificado.`;
}

// ============================================
// Parsing Logic
// ============================================

function parseAIResponse(content: string): SuggestedTask[] {
    try {
        // Try to extract JSON if wrapped in code blocks
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('[AI] No JSON found in response:', content);
            throw new Error('Formato de resposta inválido da IA');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
            throw new Error('Resposta não contém array de tasks');
        }

        // Validate and sanitize each task
        const tasks: SuggestedTask[] = parsed.tasks
            .filter((t: any) => t.title && typeof t.title === 'string')
            .map((t: any) => ({
                title: t.title.trim(),
                description: (t.description || '').trim(),
                complexity: ['LOW', 'MEDIUM', 'HIGH'].includes(t.complexity)
                    ? t.complexity
                    : 'MEDIUM',
            }));

        if (tasks.length === 0) {
            throw new Error('Nenhuma sugestão de task gerada');
        }

        return tasks;
    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error('[AI] Failed to parse JSON:', content);
            throw new Error('Erro ao processar resposta da IA');
        }
        throw error;
    }
}

// ============================================
// Use Case Implementations
// ============================================

/**
 * V1: Original single-stage approach (legacy)
 */
async function suggestTasksForFeatureV1(
    input: SuggestTasksInput,
    deps: SuggestTasksDeps
): Promise<SuggestedTask[]> {
    const { aiAdapter } = deps;
    const userPrompt = buildUserPrompt(input);

    const result = await aiAdapter.chatCompletion({
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 3000, // Higher limit for multiple tasks
    });

    return parseAIResponse(result.content.trim());
}

/**
 * V2: Two-stage approach (Chat filter → Reasoner generate)
 */
async function suggestTasksForFeatureV2(
    input: SuggestTasksInput,
    deps: SuggestTasksDeps
): Promise<SuggestedTask[]> {
    const { aiAdapter } = deps;

    // FASE 1: Filter relevant docs (if any)
    let relevantContext = '';
    if (input.projectDocs?.length) {
        const featureContextClean = stripMarkdown(`
            Feature: ${input.feature.title}
            Status: ${input.feature.status}
            ${input.feature.description || ''}
        `);

        const epicContextClean = input.epic
            ? stripMarkdown(`Epic: ${input.epic.title}\n${input.epic.description || ''}`)
            : '';

        const objective = `Sugerir tasks para feature "${input.feature.title}"`;

        const filtered = await filterRelevantContext(
            {
                objective,
                allDocs: input.projectDocs,
                featureContext: `${featureContextClean}\n${epicContextClean}`,
            },
            { aiAdapter }
        );

        relevantContext = filtered.cleanedContext;
    }

    // FASE 2: Generate with Reasoner using filtered context
    const cleanFeature = stripMarkdown(input.feature.description || '');
    const cleanEpic = input.epic ? stripMarkdown(input.epic.description || '') : '';

    const reasonerInput = `
Sugira tasks para a feature:

FEATURE:
Título: ${input.feature.title}
Status: ${input.feature.status}
${cleanFeature}

${cleanEpic ? `EPIC PAI:\n${input.epic!.title}\n${cleanEpic}` : ''}

Analise e sugira entre 3 e 8 Tasks filhas acionáveis.
Retorne JSON: {"tasks": [{"title": "...", "description": "...", "complexity": "LOW|MEDIUM|HIGH"}]}
`.trim();

    const result = await aiAdapter.reasonerCompletion({
        objective: reasonerInput,
        context: relevantContext,
        systemPrompt: SYSTEM_PROMPT,
        temperature: AI_TEMPERATURE_CREATIVE,
        maxTokens: 3000, // Higher for task suggestions
    });

    return parseAIResponse(result.content.trim());
}

// ============================================
// Main Use Case
// ============================================

/**
 * Suggest Tasks for Feature Use Case
 * 
 * Uses AI to analyze a Feature and generate suggested child Tasks.
 * Returns structured task suggestions for user review.
 * 
 * Supports two-stage AI pipeline (filter → reasoner) when NEXT_PUBLIC_USE_TWO_STAGE_AI=true
 * 
 * @example
 * ```typescript
 * const suggestions = await suggestTasksForFeature(
 *   { feature: { title, description, status }, epic },
 *   { aiAdapter }
 * );
 * ```
 */
export async function suggestTasksForFeature(
    input: SuggestTasksInput,
    deps: SuggestTasksDeps
): Promise<SuggestedTask[]> {
    return suggestTasksForFeatureV2(input, deps);
}
