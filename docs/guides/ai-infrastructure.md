# 🤖 AI Infrastructure

> Sistema de IA integrado usando **OpenAI SDK** com **DeepSeek API** para funcionalidades inteligentes no Jira Killer.

---

## 📋 Índice

- [Overview](#-overview)
- [Arquitetura](#-arquitetura)
- [Configuração](#️-configuração)
- [Módulos](#-módulos)
  - [AI Adapter](#ai-adapter)
  - [Context Builders](#context-builders)
  - [Prompt Templates](#prompt-templates)
  - [Use Cases](#use-cases)
- [API Endpoints](#-api-endpoints)
- [Uso no Frontend](#-uso-no-frontend)
- [Extensibilidade](#-extensibilidade)

---

## 🎯 Overview

O sistema de IA do Jira Killer é projetado para **augmentar** a produtividade do usuário, oferecendo funcionalidades como:

| Feature | Status | Descrição |
|---------|--------|-----------|
| Melhorar Descrição de Task | ✅ Implementado | Refina descrições usando contexto da Feature |
| Gerar Descrição de Task | ✅ Implementado | Cria descrição com base no título e contexto |
| Sugerir Tasks de Feature | ✅ Implementado | Sugere 3-8 tasks com base na descrição da Feature |
| Melhorar Descrição de Feature | ✅ Implementado | Gera/melhora descrição estruturada de Features |
| Refinar Texto | ✅ Implementado | Melhora escrita, gramática e markdown de qualquer texto |
| Contexto de Docs do Projeto | ✅ Implementado | Inclui documentação do projeto como contexto para IA |
| Resumir Epic | 🔜 Planejado | Cria resumo executivo de um Epic |

### Princípios de Design

1. **Context-Aware** - Toda geração usa contexto hierárquico (Project → Epic → Feature → Task)
2. **Non-Destructive** - IA sugere, usuário decide se aplica
3. **Modular** - Fácil adicionar novos casos de uso
4. **Type-Safe** - Tipagem completa de ponta a ponta

---

## 🏗 Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Task Dialog → useGenerateDescription / useImproveDesc  │   │
│  │  Feature Page → useSuggestTasks                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Routes (Next.js)                        │
│  /api/ai/improve-description                                    │
│  /api/ai/generate-description                                   │
│  /api/ai/suggest-tasks                                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Use Case Layer                             │
│  improveTaskDescription / generateTaskDescription               │
│  suggestTasksForFeature                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Fetch Data → 2. Build Context → 3. Prompt → 4. AI  │   │
│  └─────────────────────────────────────────────────────────┘   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Context Builder │  │ Prompt Template │  │   AI Adapter    │
│  Extrai dados   │  │ Formata prompt  │  │  Chama DeepSeek │
│  + ProjectDocs  │  │  estruturado    │  │  via OpenAI SDK │
└─────────────────┘  └─────────────────┘  └────────┬────────┘
                                                   │
                                                   ▼
                                          ┌───────────────┐
                                          │  DeepSeek API │
                                          │  (LLM Cloud)  │
                                          └───────────────┘
```

---

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# .env.local

# DeepSeek API Key (obrigatório para features de IA)
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> ⚠️ **Importante**: Sem a `DEEPSEEK_API_KEY` configurada, as chamadas de IA irão falhar.

### Modelos Disponíveis

| Modelo | Uso Recomendado | Custo |
|--------|-----------------|-------|
| `deepseek-chat` | Chat/Descrições (default) | $ |
| `deepseek-coder` | Código/Técnico | $ |

---

## 📦 Módulos

### AI Adapter

**Localização:** `src/infra/adapters/ai/`

O adapter encapsula a comunicação com a API do DeepSeek usando o SDK oficial da OpenAI.

```typescript
import { aiAdapter } from '@/infra/adapters/ai';

const result = await aiAdapter.chatCompletion({
  messages: [
    { role: 'system', content: 'Você é um assistente.' },
    { role: 'user', content: 'Olá!' }
  ],
  temperature: 0.7,
  maxTokens: 500,
});
```

#### Métodos Disponíveis

| Método | Descrição |
|--------|-----------|
| `chatCompletion(input)` | Completion síncrono, retorna resposta completa |
| `chatCompletionStream(input)` | Streaming, retorna async generator |
| `generateText(prompt, options)` | Helper simples para prompt único |

---

### Context Builders

**Localização:** `src/domain/use-cases/ai/context/`

Context builders extraem e estruturam os dados necessários para a geração de prompts.

```typescript
import { buildTaskDescriptionContext } from '@/domain/use-cases/ai/context';

const context = buildTaskDescriptionContext(task, feature.description, projectDocs);
```

#### Contextos Implementados

| Context Builder | Input | Suporta ProjectDocs |
|----------------|-------|---------------------|
| `buildTaskDescriptionContext` | Task + Feature description | ✅ Sim |

---

### Prompt Templates

**Localização:** `src/domain/use-cases/ai/prompts/`

Templates que transformam contexto estruturado em prompts otimizados para o LLM.

#### Templates Implementados

| Template | Propósito |
|----------|-----------|
| `buildImproveDescriptionPrompt` | Melhora descrição de Task existente |

> **Nota**: O `generateTaskDescription` e `suggestTasksForFeature` definem prompts inline.

---

### Use Cases

**Localização:** `src/domain/use-cases/ai/`

Use cases orquestram o fluxo completo: contexto → prompt → AI → resultado.

#### Use Cases Implementados

| Use Case | Input | Output | Descrição |
|----------|-------|--------|-----------|
| `chatCompletion` | Messages + options | `ChatCompletionResult` | Base de completions |
| `improveTaskDescription` | Task + Feature desc + ProjectDocs? | `string` | Melhora descrição existente |
| `generateTaskDescription` | Title + Feature + ProjectDocs? | `string` | Gera nova descrição |
| `suggestTasksForFeature` | Feature + Epic? + ProjectDocs? | `SuggestedTask[]` | Sugere tasks filhas |

---
## 🔀 Diferenças Entre Features de IA

### Improve Description vs Refine Text

| Aspecto | **Improve Description** | **Refine Text** |
|---------|------------------------|-----------------|
| **Objetivo** | Gerar descrição completa usando contexto rico | Melhorar escrita do texto existente |
| **Input** | taskId (busca contexto automaticamente) | Apenas o texto bruto |
| **Contexto** | Feature, Project Docs, Task atual | Nenhum (ou contexto minimal) |
| **Output** | Nova descrição estruturada | Versão refinada do texto original |
| **Temperatura** | 0.7 (criativo) | 0.3 (conservador) |
| **Uso** | Gerar descrição detalhada | Polir texto rapidamente |
| **Adiciona Info?** | ✅ Sim (baseado em contexto) | ❌ Não (só melhora existente) |

**Quando usar Improve?**
- Task nova sem descrição
- Descrição muito curta que precisa de contexto
- Quer aproveitar docs do projeto

**Quando usar Refine?**
- Já tem texto bom, só quer polir
- Corrigir gramática/markdown
- Não quer adicionar info nova
- Resposta rápida (menos tokens)

---
## 🌐 API Endpoints

### `POST /api/ai/improve-description`

Melhora a descrição de uma task existente.

```json
// Request
{ "taskId": "uuid", "includeProjectDocs": true }

// Response
{ "data": { "description": "...", "taskId": "uuid" } }
```

---

### `POST /api/ai/generate-description`

Gera descrição para nova task (sem taskId).

```json
// Request
{
  "title": "Implementar login",
  "featureId": "uuid",
  "type": "TASK",
  "priority": "HIGH",
  "includeProjectDocs": true
}

// Response
{ "data": { "description": "...", "featureId": "uuid" } }
```

---

### `POST /api/ai/suggest-tasks`

Analisa uma Feature e sugere tasks filhas.

```json
// Request
{ "featureId": "uuid", "includeProjectDocs": true }

// Response
{
  "data": {
    "suggestions": [
      {
        "title": "Criar endpoint de autenticação",
        "description": "## Objetivo\n...",
        "complexity": "MEDIUM"
      }
    ],
    "featureId": "uuid"
  }
}
```

---

### `POST /api/ai/improve-feature-description`

Melhora/gera descrição de uma Feature.

```json
// Request
{ "featureId": "uuid", "includeProjectDocs": true }

// Response
{ "data": { "description": "...", "featureId": "uuid" } }
```

---

### `POST /api/ai/refine-text`

**Nova Feature** - Refina texto existente (gramática, markdown, clareza).

```json
// Request
{
  "text": "implementar login com email e senha validar campos",
  "context": "descrição de task" // opcional
}

// Response
{
  "data": {
    "refinedText": "Implementar autenticação por email e senha:\n\n- Validar formato de email\n- Validar senha (mínimo 8 caracteres)\n- Exibir mensagens de erro\n- Redirecionar após sucesso",
    "originalLength": 52,
    "refinedLength": 178
  }
}
```

**Diferenças vs `/improve-description`:**
- ❌ Não busca contexto (Feature, Docs)
- ❌ Não adiciona informações novas
- ✅ Apenas melhora o que já existe
- ✅ Mais rápido (menos tokens)
- ✅ Temperatura baixa (0.3 vs 0.7)

---

## 💻 Uso no Frontend

### Hooks Disponíveis

**Localização:** `src/lib/query/hooks/use-ai.ts`

```typescript
import { 
  useImproveDescription, 
  useGenerateDescription,
  useSuggestTasks 
} from '@/lib/query';
```

#### `useImproveDescription`

```typescript
const improve = useImproveDescription();

await improve.mutateAsync({ 
  taskId: "uuid", 
  includeProjectDocs: true 
});
```

#### `useGenerateDescription`

```typescript
const generate = useGenerateDescription();

await generate.mutateAsync({
  title: "Implementar login",
  featureId: "uuid",
  type: "TASK",
  priority: "HIGH",
  includeProjectDocs: true,
});
```

#### `useSuggestTasks`

```typescript
const suggest = useSuggestTasks();

const result = await suggest.mutateAsync({
  featureId: "uuid",
  includeProjectDocs: true,
});
// result.suggestions: SuggestedTask[]
```

---

### Componentes UI

| Componente | Localização | Uso |
|------------|-------------|-----|
| `AIImproveButton` | `src/components/ui/ai-improve-button.tsx` | Botão estilizado para ações de IA |
| `SuggestTasksModal` | `src/components/features/tasks/suggest-tasks-modal.tsx` | Modal de preview de sugestões |

---

## 📁 Estrutura de Arquivos

```
src/
├── infra/adapters/ai/
│   ├── index.ts              # Singleton + exports
│   ├── ai.adapter.ts         # Classe AIAdapter
│   └── types.ts              # Tipos do adapter
│
├── domain/use-cases/ai/
│   ├── index.ts              # Barrel export
│   ├── chat-completion.ts    # Use case base
│   ├── improve-task-description.ts
│   ├── generate-task-description.ts
│   ├── suggest-tasks-for-feature.ts  # NEW
│   ├── context/
│   │   ├── index.ts
│   │   └── task-description-context.ts
│   └── prompts/
│       ├── index.ts
│       └── improve-task-description.ts
│
├── app/api/ai/
│   ├── improve-description/route.ts
│   ├── generate-description/route.ts
│   └── suggest-tasks/route.ts        # NEW
│
├── lib/query/hooks/
│   └── use-ai.ts             # Frontend hooks
│
└── components/
    ├── ui/
    │   └── ai-improve-button.tsx
    └── features/tasks/
        └── suggest-tasks-modal.tsx   # NEW
```

---

## 🔌 Extensibilidade

Para adicionar nova funcionalidade de IA:

1. **Criar Use Case** em `src/domain/use-cases/ai/`
2. **Criar API Route** em `src/app/api/ai/`
3. **Adicionar Hook** em `src/lib/query/hooks/use-ai.ts`
4. **Criar UI** (botão/modal) conforme necessário
5. **Atualizar exports** em `index.ts`

---

*Última atualização: Dezembro 2025*
