# 📚 Documentação do Jira Killer

> Sistema de gerenciamento de projetos focado em engenharia, "Opinionated" e "Low Friction".

## 🗂️ Estrutura de Documentação

```
docs/
├── README.md              # 📖 VOCÊ ESTÁ AQUI - Índice completo
├── AI-CONTEXT.md          # 🤖 Contexto rápido para AI Agents
├── architecture/          # 🏗️ Decisões arquiteturais
│   ├── overview.md        # Visão geral da arquitetura
│   ├── domain-model.md    # Modelo de domínio (DDD)
│   ├── workflows.md       # Fluxos e máquina de estados
│   ├── cache-audit-analysis.md   # 🔍 Análise de problemas de cache
│   └── cache-fix-implementation.md # ✅ Correções implementadas
├── guides/                # 📖 Guias práticos
│   ├── date-handling.md   # Manipulação de datas (CRÍTICO)
│   ├── cache-invalidation-patterns.md # 📚 Padrões de cache (NOVO)
│   ├── ai-infrastructure.md # 🤖 Sistema de IA (DeepSeek)
│   ├── ai-scribe.md       # Sistema de IA para geração de tasks
│   └── scrum-poker.md     # Sistema de estimativa
├── ui-ux/                 # 🎨 Design system
│   ├── design-system.md   # Princípios visuais
│   └── components.md      # Componentes chave
├── planning/              # 📊 Status e roadmap
│   └── project-status.md  # Visão 360° do projeto
└── database/              # 🗄️ Schema e migrations
    └── schema.md          # Estrutura do banco
```

## 🚀 Quick Start

### Para Desenvolvedores
1. Leia [AI-CONTEXT.md](./AI-CONTEXT.md) para visão geral rápida
2. Consulte [architecture/overview.md](./architecture/overview.md) para entender a estrutura
3. **SEMPRE** consulte [guides/date-handling.md](./guides/date-handling.md) antes de manipular datas

### Para AI Agents
1. Comece por [AI-CONTEXT.md](./AI-CONTEXT.md)
2. Use as tags semânticas para busca rápida:
   - `#critical-business` - Regras críticas
   - `#architecture` - Decisões arquiteturais
   - `#ui-patterns` - Design system

## 📑 Documentos por Prioridade

### 🔴 Críticos (Leitura Obrigatória)
| Documento | Descrição |
|-----------|-----------|
| [AI-CONTEXT.md](./AI-CONTEXT.md) | Contexto completo em uma página |
| [guides/date-handling.md](./guides/date-handling.md) | Manipulação de datas e timezone |
| [guides/cache-invalidation-patterns.md](./guides/cache-invalidation-patterns.md) | **Padrões de cache React Query** |
| [database/schema.md](./database/schema.md) | Estrutura do banco de dados |

### 🟡 Importantes
| Documento | Descrição |
|-----------|-----------|
| [architecture/domain-model.md](./architecture/domain-model.md) | Entidades e hierarquia |
| [architecture/workflows.md](./architecture/workflows.md) | Máquina de estados |
| [ui-ux/design-system.md](./ui-ux/design-system.md) | Princípios de UI |

### 🟢 Referência
| Documento | Descrição |
|-----------|-----------|
| [guides/ai-infrastructure.md](./guides/ai-infrastructure.md) | Infraestrutura de IA (DeepSeek) |
| [guides/ai-scribe.md](./guides/ai-scribe.md) | Sistema de IA |
| [guides/scrum-poker.md](./guides/scrum-poker.md) | Estimativas |
| [ui-ux/components.md](./ui-ux/components.md) | Componentes |

---

*Última atualização: Janeiro 2026*
