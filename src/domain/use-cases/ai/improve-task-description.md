# Improve Task Description Use Case

Use-case para melhorar a descrição de uma task usando IA.

## Input

```typescript
{
  task: TaskWithReadableId;      // Task completa com relações
  featureDescription?: string;   // Descrição da feature (opcional, buscada separadamente)
}
```

## Output

```typescript
string  // Nova descrição melhorada
```

## Dependencies

- `aiAdapter`: Instância do AIAdapter configurado para DeepSeek

## Fluxo

1. **Context Builder**: Extrai dados relevantes da task e feature
2. **Prompt Template**: Formata o contexto em um prompt estruturado
3. **AI Call**: Envia para o DeepSeek e retorna a resposta

## Contexto Enviado para IA

- Título e descrição da Feature (para contexto amplo)
- Título, tipo, prioridade e descrição atual da Task
- System prompt com diretrizes de como melhorar a descrição

## Exemplo de Uso

```typescript
import { improveTaskDescription } from '@/domain/use-cases/ai';
import { aiAdapter } from '@/infra/adapters/ai';

const improvedDescription = await improveTaskDescription(
  { 
    task: taskWithRelations,
    featureDescription: feature.description 
  },
  { aiAdapter }
);

// Atualizar a task com a nova descrição
await taskRepository.update(task.id, orgId, { 
  description: improvedDescription 
});
```

## Extensibilidade

Este padrão pode ser replicado para:
- `improveFeatureDescription` - Melhorar descrição de Feature
- `generateTasksFromFeature` - Gerar tasks a partir de uma Feature
- `summarizeEpic` - Criar resumo de um Epic
