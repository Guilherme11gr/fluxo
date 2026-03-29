---
tags: [architecture, overview]
priority: high
last-updated: 2025-12
---

# 🏗️ Visão Geral da Arquitetura

## Filosofia

O Jira Killer segue uma **Clean Architecture Leve**, otimizada para:
- Velocidade de desenvolvimento (MVP em 2 semanas)
- Testabilidade (use cases puros)
- Manutenibilidade (separação clara de responsabilidades)

---

## Estrutura de Diretórios

```
src/
├── app/                    # 🌐 Routes (Next.js App Router)
│   ├── (auth)/             # Rotas autenticadas
│   ├── (public)/           # Rotas públicas
│   └── api/                # API Routes
│
├── domain/                 # 💎 Core do Negócio
│   └── use-cases/          # Casos de uso puros
│
├── infra/                  # 🔌 Infraestrutura
│   └── adapters/           # Implementações de ports
│       ├── supabase/       # Adapter Supabase
│       └── ai/             # Adapter OpenAI/Anthropic
│
├── server/                 # 🖥️ Server-Only Services
│   └── services/           # Composição para SSR/BFF
│
├── shared/                 # 📦 Compartilhado
│   ├── types/              # DTOs e interfaces
│   ├── utils/              # Utilitários puros
│   └── http/               # Helpers HTTP (auth, cache)
│
├── hooks/                  # 🎣 React Hooks
│
└── components/             # 🧩 UI Components
    ├── ui/                 # Shadcn/UI base
    └── features/           # Componentes de feature
```

---

## Camadas e Responsabilidades

### 1. Routes (Controllers) - `app/`

**Responsabilidade:** Orquestração HTTP

```typescript
// ✅ O que FAZ:
- Extrair/validar params/body (tipos nomeados)
- Autenticar via extractAuthenticatedTenant()
- Chamar use case/service
- Mapear erro → status HTTP
- Aplicar cacheHeaders
- Serializar resposta JSON

// ❌ O que NÃO FAZ:
- Regra de negócio
- Acesso direto a dados
- Formatação de dinheiro/datas
```

**Exemplo:**
```typescript
export async function GET(request: Request) {
  // 1. Auth
  const { tenantId } = await extractAuthenticatedTenant(supabase);
  
  // 2. Parse params
  const { projectId } = parseProjectParams(request);
  
  // 3. Call use case
  const result = await listTasks({ tenantId, projectId });
  
  // 4. Response
  return NextResponse.json(result, { 
    headers: cacheHeaders('short') 
  });
}
```

---

### 2. Use Cases - `domain/use-cases/`

**Responsabilidade:** Regras de negócio puras

```typescript
// ✅ O que FAZ:
- Centro da lógica de negócio
- Puros e testáveis (sem side effects)
- Dinheiro SEMPRE em centavos
- Determinísticos
- Recebem ports via injeção

// ❌ O que NÃO FAZ:
- Conhecer Next.js/HTTP/UI
- Acessar banco diretamente
- Formatar dados para apresentação
```

**Exemplo:**
```typescript
// domain/use-cases/create-task.ts

export interface CreateTaskInput {
  featureId: string;
  title: string;
  description?: string;
  module?: string;
  type: 'TASK' | 'BUG';
}

export interface CreateTaskOutput {
  id: string;
  key: string; // Ex: "APP-123"
}

export async function createTask(
  input: CreateTaskInput,
  deps: { taskRepo: TaskRepository }
): Promise<CreateTaskOutput> {
  // Validações de negócio
  if (input.type === 'BUG' && !input.description) {
    throw new DomainError('Bugs devem ter descrição');
  }
  
  // Criação via port
  return deps.taskRepo.create(input);
}
```

---

### 3. Adapters - `infra/adapters/`

**Responsabilidade:** Implementar interfaces para externos

```typescript
// ✅ O que FAZ:
- Implementar ports (TaskRepository, etc)
- Comunicar com Supabase/APIs externas
- Transformar dados externos → domínio
- Pode ter TTL/cache

// ❌ O que NÃO FAZ:
- Lógica de domínio
- Validações de negócio
```

**Exemplo:**
```typescript
// infra/adapters/supabase/task-repository.ts

export class SupabaseTaskRepository implements TaskRepository {
  async create(input: CreateTaskInput): Promise<CreateTaskOutput> {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        feature_id: input.featureId,
        title: input.title,
        // ... mapping
      })
      .select('id, key')
      .single();
    
    if (error) throw new InfraError(error.message);
    return data;
  }
}
```

---

### 4. Server Services - `server/`

**Responsabilidade:** Composição para SSR/BFF

```typescript
// ✅ O que FAZ:
- Agregações cross-fonte
- React cache / revalidateTag
- Composição de use cases para páginas

// ❌ O que NÃO FAZ:
- Reimplementar regras de negócio
```

**Exemplo:**
```typescript
// server/services/dashboard-service.ts

import { cache } from 'react';

export const getDashboardData = cache(async (userId: string) => {
  const [tasks, bugs] = await Promise.all([
    listUserTasks({ userId, status: ['DOING', 'TODO'] }),
    listUserBugs({ userId }),
  ]);
  
  return { tasks, bugs, grouped: groupByModule(tasks) };
});
```

---

### 5. Shared - `shared/`

**Responsabilidade:** Código compartilhado e utilitários

```
shared/
├── types/           # DTOs, interfaces
├── utils/           # Utilitários puros
│   ├── date-utils.ts    # ⚠️ CRÍTICO: manipulação de datas
│   └── formatters.ts    # Formatação de moeda, telefone
├── http/            # Helpers HTTP
│   ├── auth.ts          # extractAuthenticatedTenant
│   └── cache.ts         # cacheHeaders
└── validators/      # Schemas de validação
```

---

## Fluxo de Dados

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Request   │────▶│    Route    │────▶│  Use Case   │────▶│   Adapter   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │                    │                    │
                    Valida params        Regra negócio         Supabase
                    Auth                 Puro/testável         External API
                    Cache headers                              
                          │                    │                    │
                          ▼                    ▼                    ▼
                    ┌─────────────────────────────────────────────────┐
                    │                   Response JSON                  │
                    └─────────────────────────────────────────────────┘
```

---

## Princípios de Design

### 1. Dependency Inversion
Use cases dependem de interfaces (ports), não de implementações.

### 2. Single Responsibility
Cada camada tem uma única responsabilidade.

### 3. Composition over Inheritance
Preferir composição de funções a herança de classes.

### 4. Domain Isolation
Domínio não conhece infraestrutura ou transporte.

---

## Decisões Técnicas Importantes

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Storage de Docs | TEXT no banco | Simplicidade, eficiência |
| Campos Custom | Não suportado | Anti-pattern Notion |
| Módulos | Array `text[]` | Não precisa de relação |
| Dinheiro | Centavos (int) | Precisão, sem float |
| Datas | UTC no banco | Consistência global |

---

## React Query Cache Strategy

### Filosofia
- **Invalidações específicas** por query key (evita refetches desnecessários)
- **Optimistic updates** em mutations para feedback instantâneo
- **Cross-entity invalidation** (epic ↔ features ↔ tasks)

### Padrões de Invalidação

#### 1. CREATE Mutations
```typescript
onSuccess: (newEntity, variables) => {
  // 1. Optimistic update: adiciona no cache
  queryClient.setQueryData(queryKeys.entity.list(parentId), ...);
  
  // 2. Invalidate specific lists
  queryClient.invalidateQueries({ queryKey: queryKeys.entity.list(parentId) });
  
  // 3. Invalidate parent detail (atualiza contadores)
  queryClient.invalidateQueries({ queryKey: queryKeys.parent.detail(parentId) });
}
```

#### 2. UPDATE Mutations
```typescript
onSuccess: (updatedEntity, variables) => {
  // 1. Optimistic update: atualiza no cache
  queryClient.setQueryData(queryKeys.entity.detail(id), updatedEntity);
  
  // 2. Invalidate detail
  queryClient.invalidateQueries({ queryKey: queryKeys.entity.detail(id) });
  
  // 3. Invalidate lists que contêm essa entity
  queryClient.invalidateQueries({ queryKey: queryKeys.entity.lists() });
  
  // 4. Invalidate entidades relacionadas (cross-entity)
  queryClient.invalidateQueries({ queryKey: queryKeys.related.list(entityId) });
}
```

#### 3. DELETE Mutations
```typescript
onSuccess: (_, deletedId) => {
  // 1. Invalidate all (entity não existe mais)
  queryClient.invalidateQueries({ queryKey: queryKeys.entity.all });
  
  // 2. Remove queries órfãs do cache
  queryClient.removeQueries({ queryKey: queryKeys.entity.detail(deletedId) });
  queryClient.removeQueries({ queryKey: queryKeys.children.list(deletedId) });
}
```

### Hierarquia de Invalidação

```
Epic (CREATE/UPDATE/DELETE)
  ↓
  └─ Invalida: queryKeys.projects.detail(projectId)
  └─ Invalida: queryKeys.features.list(epicId)
  └─ Invalida: queryKeys.epics.lists()

Feature (CREATE/UPDATE/DELETE)
  ↓
  └─ Invalida: queryKeys.epics.detail(epicId)
  └─ Invalida: queryKeys.tasks.lists()
  └─ Invalida: queryKeys.features.lists()

Task (CREATE/UPDATE/DELETE)
  ↓
  └─ Invalida: queryKeys.features.detail(featureId)
  └─ Invalida: queryKeys.tasks.lists()
```

### Cache Times (CACHE_TIMES)
- **staleTime:** 30s - Dados considerados frescos por 30s
- **cacheTime:** 5min - Cache mantido em memória por 5min

### Benefícios
- ✅ **UI reflete mudanças instantaneamente** (sem F5 manual)
- ✅ **Zero latência perceptível** (optimistic updates)
- ✅ **Consistência cross-entity** (contadores atualizados)
- ✅ **Performance otimizada** (invalida apenas o necessário)

---

## Ver Também

- [domain-model.md](./domain-model.md) - Modelo de domínio detalhado
- [workflows.md](./workflows.md) - Máquina de estados
- [../database/schema.md](../database/schema.md) - Schema do banco
