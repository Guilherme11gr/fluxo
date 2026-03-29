# Chat Completion Use Case

Use-case base para completions de chat usando DeepSeek via SDK OpenAI.

## Input

```typescript
{
  messages: AIMessage[];    // Array de mensagens { role, content }
  systemPrompt?: string;    // Prompt de sistema opcional
  temperature?: number;     // Temperatura (0-2, default 0.7)
  maxTokens?: number;       // Limite máximo de tokens na resposta
}
```

## Output

```typescript
{
  content: string;          // Conteúdo da resposta
  role: AIRole;             // Role da mensagem de resposta
  finishReason: string;     // Razão de término (stop, length, etc)
  usage?: {                 // Estatísticas de uso de tokens
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## Dependencies

- `aiAdapter`: Instância do AIAdapter configurado para DeepSeek

## Regras de Negócio

- Se `systemPrompt` for fornecido, ele é adicionado como primeira mensagem do tipo `system`
- As mensagens do usuário são adicionadas após o system prompt
- Temperature default é 0.7 (balanceado entre criatividade e consistência)
- Modelo default é `deepseek-chat`

## Exemplo de Uso

```typescript
import { chatCompletion } from '@/domain/use-cases/ai';
import { aiAdapter } from '@/infra/adapters/ai';

const result = await chatCompletion(
  {
    messages: [{ role: 'user', content: 'Explique o que é DDD em poucas palavras.' }],
    systemPrompt: 'Você é um especialista em arquitetura de software.',
    temperature: 0.5,
  },
  { aiAdapter }
);

console.log(result.content);
```
