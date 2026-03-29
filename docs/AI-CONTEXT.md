---
tags: [critical-business, architecture, ai-context]
priority: critical
last-updated: 2025-12
---

# 🤖 AI Context - Jira Killer

> Documento de contexto rápido para AI Agents. Leia este arquivo PRIMEIRO.

## 📋 Resumo Executivo

**Produto:** "Jira Killer" - Gerenciador de projetos interno focado em engenharia.

**Conceito Core:**
- **Opinionated:** Fluxo rígido, sem configurações infinitas
- **Low Friction:** Rápido de usar, zero fricção
- **AI-First:** "AI Scribe" transforma anotações em tasks estruturadas

**Anti-Patterns (O que NÃO somos):**
- ❌ Notion (sem campos infinitos customizáveis)
- ❌ Jira (sem configuração complexa de workflows)

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| **Frontend** | Next.js 16+ (App Router), TypeScript strict |
| **Styling** | Tailwind CSS + Shadcn/UI |
| **Backend/DB** | Supabase (PostgreSQL) |
| **Realtime** | Supabase Realtime |
| **AI** | OpenAI GPT-4o-mini ou Claude 3.5 Sonnet |
| **ORM** | Prisma (preparado para migração futura) |

---

## 🏗️ Arquitetura (Clean Architecture Leve)

```
src/
├── app/              # Routes (thin controllers)
├── domain/
│   └── use-cases/    # Regras de negócio puras
├── infra/
│   └── adapters/     # Supabase, APIs externas
├── server/           # Services server-only (SSR/BFF)
├── shared/           # DTOs, types, validators
├── hooks/            # React hooks
└── components/       # UI components
```

### Regras de Camada
- **Routes:** Validação, auth, chamada de use case, resposta HTTP
- **Use Cases:** Lógica pura, sem framework, recebem ports
- **Adapters:** Implementam interfaces para Supabase/externos
- **Shared:** Tipos, DTOs, utilitários puros

---

## 📊 Modelo de Domínio (Hierarquia Rígida)

```
Organization (Tenant)
└── Project (Produto)
    ├── modules: string[]     # Ex: ['SDK', 'API', 'WEB']
    ├── Project Docs          # Memória da IA (Markdown)
    └── Epic (Objetivo Macro)
        └── Feature (Entregável)
            └── Task/Bug (Unidade de trabalho)
```

### Entidades Principais
1. **Organization:** Tenant (empresa)
2. **Project:** Unidade de entrega de valor
3. **Module:** Contexto técnico (array no Project, não tabela)
4. **Epic:** Objetivo de negócio macro
5. **Feature:** Entregável funcional
6. **Task:** Unidade indivisível (`TASK` ou `BUG`)
7. **Project Docs:** Markdown no banco (memória da IA)

---

## 🔄 Workflow (Máquina de Estados)

```
BACKLOG → TODO → DOING → REVIEW → QA_READY → DONE
```

### Estados
| Estado | Descrição |
|--------|-----------|
| `BACKLOG` | Ideias ou bugs reportados |
| `TODO` | Selecionado para o ciclo |
| `DOING` | Em desenvolvimento |
| `REVIEW` | PR aberto / Code Review |
| `QA_READY` | Em ambiente de testes |
| `DONE` | Validado e em produção |

### Fluxo de QA
- **Ping-Pong:** QA move de `QA_READY` → `DOING` (mesmo assignee)
- **Bug Real:** QA cria nova Task `type=BUG` vinculada à Feature

---

## 🔴 Regras de Negócio CRÍTICAS

### 1. Datas e Timezone
- **Backend/Banco:** SEMPRE UTC
- **UI:** SEMPRE timezone local (America/Sao_Paulo)
- **OBRIGATÓRIO:** Usar funções de `@/shared/utils/date-utils`
- **PROIBIDO:** Usar date-fns diretamente

### 2. Dinheiro
- **Domínio:** SEMPRE em centavos (number)
- **UI:** Formatação só na borda

### 3. Modules
- Implementados como `text[]` na tabela `projects`
- NÃO é tabela relacional separada
- Controlado pelo Owner do projeto

### 4. Project Docs
- Salvos como `TEXT` puro no banco (coluna `content`)
- NÃO usar Supabase Storage/Buckets
- Servem como contexto para a IA

---

## 🎯 Features Principais

### AI Scribe (Killer Feature)
- Transforma "Brain Dumps" em tasks estruturadas
- Usa `project_docs` como contexto
- Staging Area para revisão antes de salvar

### Scrum Poker (In-Place)
- Estimativa dentro do Modal de Task
- Realtime via Supabase
- Moderador revela votos

### Dashboard "My Focus"
- Agrupado por Módulo
- Prioridade: Bugs > DOING/REVIEW > TODO
- Bugs com borda vermelha

---

## 🎨 Design System

- **Tema:** Dark Mode nativo (`slate-950` bg, `slate-900` cards)
- **Bugs:** `red-500` (borda/ícone)
- **Módulos:** Cores consistentes por hash da string
- **Animações:** Sutis (opacity, translate) - EVITAR scale

---

## 📁 Onde Encontrar

| Informação | Arquivo |
|------------|---------|
| **Roadmap técnico** | `docs/ROADMAP.md` |
| Schema do banco | `docs/database/schema.md` |
| Workflows detalhados | `docs/architecture/workflows.md` |
| Modelo de domínio | `docs/architecture/domain-model.md` |
| Design System | `docs/ui-ux/design-system.md` |
| Sistema de IA | `docs/guides/ai-scribe.md` |

---

## ⚡ Comandos Úteis

```bash
# Supabase (SEMPRE usar mcp)
mcp supabase migration list
mcp supabase db push
mcp supabase status

# Dev
npm run dev
npm run build
npm run lint
npm run typecheck
```

---

*Este documento é a fonte de verdade para AI Agents trabalhando no projeto.*
