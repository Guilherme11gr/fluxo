import type { TaskDescriptionContext } from '../context';

const SYSTEM_PROMPT = `Você é um assistente especializado em gestão de projetos de software.
Seu papel é melhorar descrições de tarefas para que sejam claras, objetivas e acionáveis.

Diretrizes:
- Mantenha a descrição concisa mas completa
- Use linguagem técnica apropriada quando necessário
- Inclua critérios de aceitação quando aplicável
- Considere o contexto da feature pai para dar mais sentido à task
- Escreva em português brasileiro
- Não adicione emojis ou formatação excessiva
- Foque em clareza e objetividade`;

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

/**
 * Build prompt for improving task description
 * Uses structured context to generate a coherent prompt
 */
export function buildImproveDescriptionPrompt(
    context: TaskDescriptionContext
): { systemPrompt: string; userPrompt: string } {
    const currentDescription = context.task.description || '(sem descrição ainda)';
    const featureDescription = context.feature.description || '(sem descrição da feature)';

    // Build project docs section if available
    const projectDocsSection = context.projectDocs?.length
        ? `
---

## Documentação do Projeto

${context.projectDocs.map(doc => `### ${doc.title}\n${doc.content}`).join('\n\n')}
`
        : '';

    const userPrompt = `## Contexto da Feature

**Feature:** ${context.feature.title}
${featureDescription}
${projectDocsSection}
---

## Task a ser melhorada

**Título:** ${context.task.title}
**Tipo:** ${TYPE_LABELS[context.task.type] || context.task.type}
**Prioridade:** ${PRIORITY_LABELS[context.task.priority] || context.task.priority}

**Descrição atual:**
${currentDescription}

---

Por favor, melhore a descrição desta task considerando o contexto da feature${context.projectDocs?.length ? ' e a documentação do projeto' : ''}.
Torne-a mais clara, objetiva e acionável para os desenvolvedores.

**Retorne APENAS a nova descrição, sem explicações adicionais ou prefixos como "Aqui está" ou "Nova descrição:".**`;

    return {
        systemPrompt: SYSTEM_PROMPT,
        userPrompt,
    };
}
