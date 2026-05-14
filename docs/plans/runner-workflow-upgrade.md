# Runner Workflow Upgrade — Agent como User do Sistema

## Contexto

Hoje o runner pega qualquer task em TODO, comments aparecem como "FluXo Runner" genérico, e o handoff não atribui o próximo agent. O objetivo é que agents se comportem como users do sistema: atribuídos a tasks, comentando com identidade própria, seguindo um pipeline de workflow.

## Fluxo Desejado

```
TODO (assigned: dev-agent)
  → dev-agent pega, executa, deixa REVIEW + assign reviewer-agent
    → reviewer-agent pega, review, deixa QA_READY + assign qa-agent
      → qa-agent pega, QA, deixa DONE
```

## Estado Atual vs Desejado

| Aspecto | Hoje | Desejado |
|---------|------|----------|
| **Polling** | `/tasks?status=TODO` — pega qualquer task | `/tasks?status=TODO&assigneeId=AGENT_ID` — só as atribuídas |
| **Comments** | Todos aparecem como "key creator" (humano) | Comments com nome/avatar do agent |
| **Projeto** | Filtro opcional via config | Obrigatório — agent só vê tasks do seu projeto |
| **Handoff** | Agent muda status mas não atribui próximo | `status: REVIEW + assigneeId: reviewer-agent` |

## Boa Notícia

Polling por `assigneeId` já funciona end-to-end. O que falta é o agent ter um userId válido pra ser atribuído.

---

## Fase 1 — Agent Identity nos Comments

**Complexidade:** 5-7h | **Risco:** Baixo

### Mudanças

| Layer | O quê |
|-------|-------|
| Schema | `Comment` ganha `agentId UUID?` (FK → Agent, SET NULL on delete). `userId` continua obrigatório como fallback |
| Repository | `CommentRepository.create()` aceita `agentId` opcional. `findByTaskId()` faz JOIN com agents quando `agentId` presente |
| API | `POST /agent/tasks/:id/comments` aceita `agentId` no body, valida ownership |
| Runner | Envia `agentId` (do registro) ao postar comments |
| UI | Comment display mostra nome/icon do agent quando `agentId` está set |

### Riscos

- `Comment.userId` nullable quebra raw SQL `LEFT JOIN user_profiles` → mitigado mantendo `userId` obrigatório
- Agent deletado mas comments permanecem → SET NULL no FK
- Comments existentes sem `agentId` → UI cai pra display de user (fallback)

### Arquivos

- `prisma/schema.prisma` — Comment model
- `src/infra/adapters/prisma/comment.repository.ts`
- `src/app/api/agent/tasks/[id]/comments/route.ts`
- `runner-go/internal/runner/runner.go`
- Componente de display de comments na UI

---

## Fase 2 — Project-Scoped Agents

**Complexidade:** 3-4h | **Risco:** Baixo

### Mudanças

| Layer | O quê |
|-------|-------|
| Schema | `Agent` ganha coluna `projectId UUID?` |
| Migration | Migrar `config.project_id` existente pra nova coluna |
| API | Agent registration/update aceita `projectId` |
| Runner | Syncer lê `projectId` da coluna (não mais do config JSON) |
| UI | Project picker no form de agent |

### Riscos

- Baixo — já funciona via config, só promove pra coluna
- Syncer precisa ler da coluna E do config (backward compat)

### Arquivos

- `prisma/schema.prisma` — Agent model
- `src/infra/adapters/prisma/agent.repository.ts`
- `src/app/api/agent/agents/route.ts`
- `runner-go/internal/sync/sync.go`
- `src/components/features/settings/agent-form-dialog.tsx`

---

## Fase 3 — Agent Assignment em Tasks

**Complexidade:** 6-8h | **Risco:** Médio

### Mudanças

| Layer | O quê |
|-------|-------|
| Schema | `Task.assigneeAgentId` ganha FK → Agent (relation `assigneeAgent Agent?`) |
| Repository | `TaskRepository` — update types, `buildWhereClause()` filtra por `assigneeAgentId` |
| API | `PATCH /agent/tasks/:id` aceita `assigneeAgentId` |
| Runner | Handoff usa `assigneeAgentId` pra atribuir próximo agent |
| UI | Task cards mostram agent como assignee. Assignment dropdown inclui agents |

### Riscos

- **Dual assignment:** task pode ter `assigneeId` (humano) E `assigneeAgentId` (agent) ao mesmo tempo → precisa decidir se允许
- **Display:** `task.assignee.displayName` quebra se task é agent-assigned → precisa resolver qual relation exibir
- **Existing code:** muitos lugares usam `task.assignee` (human) — precisa auditar todos

### Arquivos

- `prisma/schema.prisma` — Task model
- `src/infra/adapters/prisma/task.repository.ts`
- `src/app/api/agent/tasks/[id]/route.ts`
- `src/domain/use-cases/tasks/update-task.ts`
- `runner-go/internal/runner/runner.go` (handoff logic)
- UI task cards e assignment components

---

## Fase 4 — Automatic Handoff Pipeline

**Complexidade:** 11-16h | **Risco:** Alto

### Mudanças

| Layer | O quê |
|-------|-------|
| Config | Chain definition no agent config: `[{status: "TODO", agent: "dev"}, {status: "REVIEW", agent: "reviewer"}, {status: "QA_READY", agent: "qa"}]` |
| Runner | Chain parser + executor — avança pra próximo step, atribui agent correto |
| API | Server-side status transition validation |
| Fallback | Timeout pra agent offline, retry logic, BLOCKED state |
| UI | Pipeline editor visual |
| Safety | Cycle detection, max-retry limits |

### Riscos Críticos

1. **Agent offline:** task fica órfã no status intermediário — precisa timeout/fallback
2. **Race condition:** dois runners fazem poll da mesma task simultaneamente — precisa de claim atômico (`UPDATE ... WHERE status=X RETURNING`)
3. **Handoff circular:** A→B→A sem ciclo infinito — precisa cycle detection
4. **Intervenção humana:** humano muda status/assignee durante execução — handoff pode conflitar
5. **Config drift:** agent config muda na UI enquanto runner está mid-execução — syncer tem delay de 120s

### Claim Atômico (Solução pra Race Condition)

```sql
-- Em vez de SELECT + UPDATE separados:
UPDATE tasks 
SET status = 'DOING', assignee_agent_id = $1
WHERE id = $2 AND status = $3
RETURNING *;
```

Se RETURNING vazio → outro agent já pegou.

### Arquivos

- `runner-go/internal/runner/runner.go` — chain logic
- `runner-go/internal/config/config.go` — chain config type
- `src/app/api/agent/tasks/[id]/route.ts` — atomic claim
- `src/infra/adapters/prisma/task.repository.ts` — claim method
- UI pipeline editor (novo componente)

---

## Ordem de Implementação Recomendada

```
Fase 1 (Agent Identity)     ████████░░░░░░░░  5-7h   ← Começar aqui
Fase 2 (Project-Scoped)     ████░░░░░░░░░░░░  3-4h
Fase 3 (Agent Assignment)   ██████░░░░░░░░░░  6-8h
Fase 4 (Handoff Pipeline)   ████████████░░░░  11-16h
```

**Total:** 25-35h de implementação

## Decisões Pendentes

1. **Dual assignment:** task pode ter humano E agent ao mesmo tempo?
2. **Agent como user:** criar row na tabela `users` pra cada agent, ou usar `agentId` paralelo?
3. **Claim atômico:** implementar desde a Fase 3 ou só na Fase 4?
4. **Pipeline config:** onde fica a chain definition? No agent config JSON, ou em tabela separada?
5. **Retry policy:** quantas vezes tentar antes de marcar como BLOCKED?
