# Runner Executions Tracking — Plano de Implementação

## Contexto

O runner hoje posta tudo como Comment (texto solto). Precisamos de registro estruturado de cada execução para:
- Ver o que o agent fez, quanto tempo levou, se falhou
- Acompanhar runs em tempo real na UI
- Métricas futuras (taxa de sucesso, tempo médio, etc.)

## O que já temos e vamos reutilizar

| Recurso | O que é | Como reutilizar |
|---------|---------|-----------------|
| `KaiCommand` model | Tem id, projectId, taskId, status (PENDING/RUNNING/COMPLETED/FAILED), output, resultSummary, createdAt/updatedAt | **Renomear/estender** para `AgentExecution` — mesma estrutura, campos novos |
| `KaiCommandStatus` enum | PENDING → RUNNING → COMPLETED/FAILED | **Adicionar** CLAIMED, TIMEOUT, CANCELLED |
| `KaiCommandType` enum | FIX/REFACTOR/TEST/DOCS | **Remover ou repurpose** — runner não usa "tipo de comando" |
| `/kai-executions` page | `notFound()` placeholder | **Reativar** como página de execuções |
| `/kai` page | `notFound()` placeholder | **Remover** ou redirecionar pra runners |
| `ActivityBlock` no dashboard | Já mostra atividades com badge "IA" e agentName | **Extender** pra mostrar execution status |
| `CommentRepository` | CRUD de comentarios | Manter — runner continua postando comentarios + cria execution |
| `AgentRepository` | CRUD de agents | Referência pra agentId FK |
| `runner.go` runner.go | Já mede elapsed, success/fail, exitCode | **Adicionar** chamadas pra API de executions |

---

## Mudanças por Camada

### 1. Prisma Schema — Estender KaiCommand → AgentExecution

**Arquivo:** `prisma/schema.prisma`

Substituir model `KaiCommand` por `AgentExecution`:

```prisma
model AgentExecution {
  id              String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId           String               @map("org_id") @db.Uuid
  agentId         String               @map("agent_id") @db.Uuid
  taskId          String               @map("task_id") @db.Uuid
  projectId       String               @map("project_id") @db.Uuid
  status          AgentExecStatus      @default(CLAIMED)
  tool            String?              @db.VarChar(50)
  model           String?              @db.VarChar(100)
  output          String?              @db.Text
  resultSummary   String?              @map("result_summary") @db.Text
  errorMessage    String?              @map("error_message") @db.Text
  exitCode        Int?                 @map("exit_code")
  duration        Int?                 // segundos
  metadata        Json                 @default("{}")
  startedAt       DateTime             @map("started_at") @db.Timestamptz(6)
  finishedAt      DateTime?            @map("finished_at") @db.Timestamptz(6)
  createdAt       DateTime             @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime             @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  agent           Agent                @relation(fields: [agentId], references: [id], onDelete: Cascade)
  task            Task                 @relation(fields: [taskId], references: [id], onDelete: Cascade)
  project         Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
  organization    Organization         @relation(fields: [orgId], references: [id], onDelete: Cascade)

  @@index([orgId], map: "idx_agent_executions_org")
  @@index([agentId], map: "idx_agent_executions_agent")
  @@index([taskId], map: "idx_agent_executions_task")
  @@index([projectId], map: "idx_agent_executions_project")
  @@index([status], map: "idx_agent_executions_status")
  @@index([orgId, createdAt(sort: Desc)], map: "idx_agent_executions_org_created")
  @@map("agent_executions")
  @@schema("public")
}
```

**Enum novo:**
```prisma
enum AgentExecStatus {
  CLAIMED
  RUNNING
  SUCCESS
  FAILED
  TIMEOUT
  CANCELLED

  @@map("agent_exec_status")
  @@schema("public")
}
```

**Remover:**
- `KaiCommand` model
- `KaiCommandType` enum
- `KaiCommandStatus` enum

**Adicionar relations nos models existentes:**
- `Agent` → `executions AgentExecution[]`
- `Task` → `executions AgentExecution[]` (trocar `kaiCommands KaiCommand[]`)
- `Project` → `executions AgentExecution[]`
- `Organization` → `executions AgentExecution[]`

**Notas:** `db push` no deploy. A tabela `kai_commands` existe mas nunca foi usada em produção (as páginas são notFound). Drop seguro.

---

### 2. Infra — AgentExecutionRepository

**Arquivo novo:** `src/infra/adapters/prisma/agent-execution.repository.ts`

```typescript
interface AgentExecutionRecord {
  id: string
  orgId: string
  agentId: string
  taskId: string
  projectId: string
  status: 'CLAIMED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'CANCELLED'
  tool: string | null
  model: string | null
  output: string | null
  resultSummary: string | null
  errorMessage: string | null
  exitCode: number | null
  duration: number | null
  metadata: Record<string, unknown>
  startedAt: Date
  finishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

class AgentExecutionRepository {
  // Criar execução (CLAIMED)
  create(data): Promise<AgentExecutionRecord>

  // Atualizar status (CLAIMED → RUNNING → SUCCESS/FAILED/TIMEOUT)
  updateStatus(id, data): Promise<AgentExecutionRecord>

  // Buscar por org (com paginação + filtros)
  findByOrgId(orgId, filters?: { status?, agentId?, projectId? }, page?, limit?): Promise<{ items, total }>

  // Buscar por task
  findByTaskId(taskId, orgId): Promise<AgentExecutionRecord[]>

  // Buscar por agent (últimas N)
  findByAgentId(agentId, orgId, limit?): Promise<AgentExecutionRecord[]>

  // Contagem por status (para métricas)
  countByStatus(orgId, since?: Date): Promise<Record<string, number>>

  // Atualizar execuções "stale" (RUNNING há mais de X tempo → TIMEOUT)
  markStaleAsTimeout(orgId, staleAfterMs: number): Promise<number>
}
```

**Arquivos modificados:**
- `src/infra/adapters/prisma/index.ts` — registrar AgentExecutionRepository

---

### 3. API — Endpoints de Execution

#### 3a. Agent API (runner chama)

**Arquivo novo:** `src/app/api/agent/executions/route.ts`

```
POST /api/agent/executions
  Body: { taskId, agentId?, status: "CLAIMED", tool?, model?, startedAt }
  → Cria execução CLAIMED

  O agentId é opcional no body — se não vier, usa o agent associado ao API key.
```

**Arquivo novo:** `src/app/api/agent/executions/[id]/route.ts`

```
PATCH /api/agent/executions/:id
  Body: { status: "RUNNING"|"SUCCESS"|"FAILED"|"TIMEOUT"|"CANCELLED",
           output?, resultSummary?, errorMessage?, exitCode?, duration?,
           finishedAt?, metadata? }
  → Atualiza execução
```

#### 3b. App API (frontend chama)

**Arquivo novo:** `src/app/api/executions/route.ts`

```
GET /api/executions?orgId=xxx&status=RUNNING&agentId=yyy&page=1&limit=20
  → Lista execuções da org (com filtros e paginação)
  → Inclui: agent name, task title, project name
```

**Arquivo novo:** `src/app/api/executions/[id]/route.ts`

```
GET /api/executions/:id
  → Detalhe da execução (inclui output completo)
```

---

### 4. Runner Go — Integrar Executions API

**Arquivo modificado:** `runner-go/internal/runner/runner.go`

No `PollAndExecute()`, adicionar chamadas:

```
// Step 1.5: Criar execution (CLAIMED)
execID := createExecution(client, task.ID, agent)

// Step 2: Claim task (igual)
...

// Step 3: RAG (igual)
...

// Step 4: Execute (igual)
updateExecution(client, execID, "RUNNING")
result := exec.Execute(...)
...

// Step 5: Post result
status := "SUCCESS" ou "FAILED"
updateExecution(client, execID, status, output, duration, exitCode)
```

**Arquivo novo:** `runner-go/internal/api/executions.go`

```go
func CreateExecution(client *Client, taskID, agentID, tool, model string) (string, error)
  // POST /executions → retorna execution ID

func UpdateExecution(client *Client, execID string, params map[string]interface{}) error
  // PATCH /executions/:id
```

**Notas:** O runner continua postando Comments também. Execution é paralelo — registro estruturado. Comment é a versão legível humana.

---

### 5. Query Hooks (Frontend)

**Arquivo novo:** `src/lib/query/hooks/use-executions.ts`

```typescript
// Lista execuções com filtros
useExecutions(orgId, filters?: { status?, agentId?, projectId? })

// Execuções de uma task específica
useTaskExecutions(taskId)

// Detail de uma execução (com output)
useExecutionDetail(executionId)

// Contagem por status (dashboard)
useExecutionStats(orgId, since?: Date)
```

**Arquivo modificado:** `src/lib/query/query-keys.ts` — adicionar bloco `executions`

---

### 6. UI — Página de Execuções

**Arquivo modificado:** `src/app/(dashboard)/kai-executions/page.tsx`
(Remover `notFound()`, implementar página real)

Rename visual da rota: `/kai-executions` → adicionar redirect ou renomear pasta para `executions`.

Layout:
```
Header: "Execuções" com subtítulo "Histórico de execuções dos agentes"
Filtros: Status (select) | Agent (select) | Projeto (select)
Tabela: Agent | Task | Status | Tool | Duration | Started | Actions
  - Cada row clicável → abre drawer com output completo
  - Status badges coloridos (igual runners)
  - Duration formatado (45s, 2m 30s, etc)

Paginação: load more ou paginação numerada
```

---

### 7. UI — Executions na Task Detail

**Arquivo modificado:** O componente de task detail existente

Adicionar seção "Execuções do Agente" abaixo dos comments:
- Timeline vertical com cada execution (status → Running → Success/Failed)
- Cada entry mostra: agent name, tool, duration, output collapsed
- Se execution em RUNNING: badge animado "Executando..."
- Botão "Ver output completo" → drawer/modal

---

### 8. UI — Activity Feed Integration

**Arquivo modificado:** `src/components/features/dashboard/activity-block.tsx`

O activity feed já mostra ações de agents (badge roxa). Estender:
- Quando activity for de uma execution, mostrar status badge (SUCCESS/FAILED)
- Linkar pra página de execuções

---

### 9. Cleanup

- Remover `/kai` page (notFound → redirect ou remover rota)
- Remover `KaiCommand` references se existirem em outros arquivos
- Atualizar `kai-executions` → renomear para `executions` (ou adicionar redirect)

---

## Ordem de Implementação

| # | O quê | Arquivos | Dependência |
|---|-------|----------|-------------|
| 1 | Schema: AgentExecution model + enum | `prisma/schema.prisma` | — |
| 2 | Repository: AgentExecutionRepository | `src/infra/adapters/prisma/agent-execution.repository.ts` | #1 |
| 3 | API Agent: POST/PATCH executions | `src/app/api/agent/executions/route.ts`, `[id]/route.ts` | #2 |
| 4 | Runner Go: chamadas de execution | `runner-go/internal/api/executions.go`, `runner-go/internal/runner/runner.go` | #3 |
| 5 | API App: GET executions | `src/app/api/executions/route.ts`, `[id]/route.ts` | #2 |
| 6 | Query hooks | `src/lib/query/hooks/use-executions.ts` | #5 |
| 7 | UI: Página de execuções | `src/app/(dashboard)/kai-executions/page.tsx` | #6 |
| 8 | UI: Executions na task detail | componente de task existente | #6 |
| 9 | UI: Activity feed integration | `activity-block.tsx` | #6 |
| 10 | Cleanup: remover KaiCommand, renomear rota | vários | #7 |

---

## Decisões de Design

- **Execution ≠ Comment:** Runner posta AMBOS. Comment é legível, Execution é estruturado. Comment continua existindo pra users que só leem comentarios.
- **Stale detection:** Um cronjob leve (ou no endpoint de listagem) marca executions "RUNNING" há mais de 1h como TIMEOUT. Protege contra runner que crashou sem reportar.
- **Output truncado:** Banco guarda output completo (TEXT), mas API de lista retorna so resultSummary. API de detail retorna tudo.
- **Metadata extensível:** Campo JSON pra guardar tokens, cost, RAG docs usados, etc. Sem schema fixo por enquanto.
- **Sem real-time:** Polling de 10s no frontend resolve. WebSocket/SSE fica pra Fase 2.
- **Página `/kai-executions`:** Reativar ao invés de criar nova rota. Rename visual no header.
