# @guilherme/agent-sdk

SDK para criar AI agents com tools, streaming e UI pronta para Next.js.

Importante:
- `@guilherme/agent-sdk` fica server-safe para helpers core/next.
- Componentes e hooks React devem ser importados de `@guilherme/agent-sdk/react`.

## Instalação

```bash
npm install @guilherme/agent-sdk zod
```

## Uso Rápido

### 1. Definir Tools

```typescript
// lib/agent/tools.ts
import { defineTool } from '@guilherme/agent-sdk';
import { z } from 'zod';

export const tools = [
  defineTool({
    name: 'create_booking',
    description: 'Cria um agendamento',
    parameters: z.object({
      clienteId: z.string(),
      data: z.string(),
      servico: z.string(),
    }),
    execute: async (args) => {
      // Chama sua API existente
      const res = await fetch('/api/bookings', {
        method: 'POST',
        body: JSON.stringify(args),
      });
      return await res.json();
    },
  }),
];
```

### 2. Criar API Route

```typescript
// app/api/agent/route.ts
import { createAgentRoute } from '@guilherme/agent-sdk/next';
import { tools } from '@/lib/agent/tools';

export const POST = createAgentRoute({
  provider: {
    baseUrl: process.env.AI_API_URL!,
    apiKey: process.env.AI_API_KEY!,
    model: 'gpt-4o-mini',
  },
  systemPrompt: 'Você é um assistente de agendamentos...',
  tools,
});
```

### 3. Adicionar UI

```tsx
// app/page.tsx
import { AgentChat } from '@guilherme/agent-sdk/react';

export default function Page() {
  return (
    <AgentChat
      endpoint="/api/agent"
      title="Assistente"
    />
  );
}
```

## API

### `defineTool(options)`

Define uma tool com validação Zod automática.

```typescript
defineTool({
  name: string;           // Nome da tool
  description: string;    // Descrição para o LLM
  parameters: ZodSchema;  // Schema Zod (convertido para JSON Schema)
  execute: (args) => Promise<any>; // Função a executar
  awaitConfirm?: boolean; // Pede confirmação antes de executar
  confirmMessage?: (args) => string; // Mensagem de confirmação customizada
});
```

### `createAgentRoute(config)`

Cria um route handler Next.js com streaming SSE.

```typescript
createAgentRoute({
  provider: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  systemPrompt: string;
  tools: RuntimeTool[];
  historySize?: number;    // default: 20
  temperature?: number;    // default: 0.5
  maxIterations?: number;  // default: 6
});
```

`provider`, `systemPrompt`, `tools` e `historyStore` também podem ser funções assíncronas por request:

```typescript
createAgentRoute({
  provider: async ({ body }) => ({
    baseUrl: process.env.AI_API_URL!,
    apiKey: process.env[`AI_API_KEY_${body.tenant}`]!,
    model: 'gpt-4o-mini',
  }),
  systemPrompt: ({ body }) => `Você opera o tenant ${body.tenant}.`,
  tools: ({ body }) => buildToolsForTenant(body.tenant),
});
```

### `AgentChat` (React)

Componente de chat drop-in.

```tsx
<AgentChat
  endpoint="/api/agent"
  title="Assistente"
  theme="dark" | "light"
  examples={['Exemplo 1', 'Exemplo 2']}
  toolLabels={{ create_booking: 'Agendado!' }}
  onToolExecuted={() => refresh()}
/>
```

### `AgentRuntime` (Core)

Motor de execução para uso sem Next.js.

```typescript
import { AgentRuntime } from '@guilherme/agent-sdk/core';

const runtime = new AgentRuntime({
  provider: { baseUrl, apiKey, model },
  systemPrompt: '...',
  tools,
});

const result = await runtime.run(messages, {
  onToken: (token) => console.log(token),
  onToolCall: (call) => console.log(call),
});
```

## Exemplos de Tools

### Chamar API existente

```typescript
defineTool({
  name: 'list_bookings',
  parameters: z.object({ date: z.string().optional() }),
  execute: async (args) => {
    const res = await fetch(`/api/bookings?date=${args.date || ''}`);
    return await res.json();
  },
});
```

### Com confirmação

```typescript
defineTool({
  name: 'cancel_booking',
  parameters: z.object({ bookingId: z.string() }),
  execute: async (args) => {
    const res = await fetch(`/api/bookings/${args.bookingId}`, { method: 'DELETE' });
    return await res.json();
  },
  awaitConfirm: true,
  confirmMessage: (args) => `Cancelar agendamento ${args.bookingId}?`,
});
```

## MCP (Model Context Protocol)

Use tools prontas de MCP servers!

### Exemplo com Filesystem

```typescript
import { createAgentRoute } from '@guilherme/agent-sdk/next';
import { createMcpTools } from '@guilherme/agent-sdk/mcp';
import { defineTool } from '@guilherme/agent-sdk';

// Conecta ao MCP server de filesystem
const { tools: fsTools, close } = await createMcpTools({
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
  prefix: 'fs_',  // fs_read_file, fs_write_file, etc.
});

// Suas tools customizadas
const myTools = [
  defineTool({
    name: 'create_booking',
    // ...
  }),
];

export const POST = createAgentRoute({
  provider: { /* ... */ },
  systemPrompt: 'Você pode ler e criar arquivos na pasta ./data...',
  tools: [...myTools, ...fsTools],
});
```

### Múltiplos MCP Servers

```typescript
import { createMcpToolsFromServers } from '@guilherme/agent-sdk/mcp';

const { tools, closeAll } = await createMcpToolsFromServers([
  {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './data'],
    prefix: 'fs_',
  },
  {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    env: { DATABASE_URL: process.env.DATABASE_URL },
    prefix: 'db_',
  },
]);
```

### MCP Servers Populares

| Server | Tools |
|--------|-------|
| `@modelcontextprotocol/server-filesystem` | read_file, write_file, list_directory |
| `@modelcontextprotocol/server-postgres` | query, insert, update |
| `@modelcontextprotocol/server-sqlite` | query |
| `@modelcontextprotocol/server-github` | create_issue, create_pr, search |
| `@modelcontextprotocol/server-slack` | send_message, list_channels |

## License

MIT
