# FluXo Runner — Implementation Plan (v2)

> **For OpenCode:** Use this plan to implement task by task. Each task is self-contained.

**Goal:** Criar o sistema FluXo Runner — automação de tasks via agentes locais (OpenCode), com acompanhamento em tempo real na UI web.

**Architecture:** O FluXo (VPS) é o orquestrador. O Runner desktop local faz polling na Agent API, spawna OpenCode com a task description, streama output de volta, e o server faz handoff automático via mudança de status/assignee.

**Simplificações vs v1:**
- Sem chat bidirecional (v1: só output streaming)
- Output armazenado como resumo (últimos 10KB), não output completo
- `workdir` só no runner local, nunca no server
- Sem Hermes skill (fase futura)
- SSE para UI (push de updates) em vez de polling da UI

---

## Contexto

### O que já existe
- **Agent API:** `extractAgentAuth()` em `src/shared/http/agent-auth.ts`, responses em `src/shared/http/agent-responses.ts`
- **Pattern de rota:** `src/app/api/agent/[entity]/route.ts` com `export const dynamic = 'force-dynamic'`
- **Repositories:** `src/infra/adapters/prisma/index.ts` — singleton pattern, um repository por entidade
- **Task model:** `prisma/schema.prisma` — campos `status`, `assigneeId`, `type`, `priority`
- **TaskStatus enum:** BACKLOG, TODO, DOING, REVIEW, QA_READY, DONE
- **Task discovery:** `GET /api/agent/tasks` já suporta filtros `status` e `assigneeId` — o runner usa isso pra encontrar tasks elegíveis
- **UpdateTask use case:** `src/domain/use-cases/tasks/update-task.ts` — usamos pra handoff (não o repository direto), pois inclui audit log

### Fluxo do Runner Desktop (referência)

O runner executa este loop. **Não faz parte do server** — é documentação pra quem for implementar o runner.

```
1. POST /agent/runner/register { name, os, architecture, version }
   → Recebe { id, status: "online" }
   → Salva nodeId localmente

2. GET /agent/runner/configs?runnerNodeId=<nodeId>
   → Recebe lista de configs habilitadas

3. LOOP (a cada config.pollingIntervalSeconds):
   a. POST /agent/runner/heartbeat { nodeId }
      → Server marca runners offline se sem heartbeat há 2+ min

   b. PARA CADA config habilitada:
      i.   Descobre tasks:
           GET /agent/tasks?status=<config.matchStatus[0]>&assigneeId=<config.matchAssigneeId>
           → Recebe lista de tasks candidatas

      ii.  Filtra tasks já em execução:
           PARA CADA task candidata:
             GET /agent/runner/executions?taskId=<id>&status=running
           → Pula tasks com execução ativa

      iii. Verifica limite de concorrência:
           GET /agent/runner/executions?configId=<configId>&status=running
           → Se count >= config.maxConcurrent, pula

      iv.  Se encontrou task válida:
           POST /agent/runner/executions {
             configId, runnerNodeId, taskId, platform: "opencode", model
           }
           → Recebe executionId

      v.   Executa o agente:
           SPAWNA: opencode run "<task description + instruction>" --model <model>
           → CWD = workdir configurado localmente
           → Mata processo após config.timeoutMinutes

      vi.  Durante execução (a cada 5s):
           POST /agent/runner/executions/<id>/output {
             output: <últimos 10KB do stdout>
           }

      vii. Ao terminar:
           SE sucesso:
             PATCH /agent/runner/executions/<id> {
               status: "done",
               outputSummary: <últimos 10KB>,
               exitCode: 0
             }
             → Server faz handoff automático (muda status/assignee da task)
           SE erro:
             PATCH /agent/runner/executions/<id> {
               status: "failed",
               errorMessage: <erro>,
               exitCode: <código>
             }
             → Server muda status da task pra onErrorStatus
```

---

## FASE 1: Database

### Task 1: Criar migration — runner_nodes + runner_configs + runner_executions

**Objective:** Criar as 3 tabelas do sistema de runner.

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/TIMESTAMP_add_runner_system/migration.sql`

**Step 1: Criar migration SQL**

```sql
-- runner_nodes: desktops conectados
CREATE TABLE "public"."runner_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "os" VARCHAR(50) NOT NULL,
    "architecture" VARCHAR(50) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'offline',
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "runner_nodes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_runner_nodes_org" ON "public"."runner_nodes"("org_id");
CREATE UNIQUE INDEX "idx_runner_nodes_org_name" ON "public"."runner_nodes"("org_id", "name");
ALTER TABLE "public"."runner_nodes" ADD CONSTRAINT "runner_nodes_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;

-- runner_configs: regras de automação
CREATE TABLE "public"."runner_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "runner_node_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "match_status" TEXT[] DEFAULT '{}',
    "match_assignee_id" UUID,
    "platform" VARCHAR(20) NOT NULL DEFAULT 'opencode',
    "model" VARCHAR(100),
    "instruction" TEXT,
    "on_done_status" VARCHAR(20),
    "on_done_assignee_id" UUID,
    "on_error_status" VARCHAR(20) DEFAULT 'BLOCKED',
    "polling_interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "max_concurrent" INTEGER NOT NULL DEFAULT 1,
    "timeout_minutes" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "runner_configs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_runner_configs_org" ON "public"."runner_configs"("org_id");
CREATE INDEX "idx_runner_configs_runner_node" ON "public"."runner_configs"("runner_node_id");
ALTER TABLE "public"."runner_configs" ADD CONSTRAINT "runner_configs_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE "public"."runner_configs" ADD CONSTRAINT "runner_configs_runner_node_id_fkey"
    FOREIGN KEY ("runner_node_id") REFERENCES "public"."runner_nodes"("id") ON DELETE CASCADE;

-- runner_executions: histórico de runs
CREATE TABLE "public"."runner_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "config_id" UUID NOT NULL,
    "runner_node_id" UUID NOT NULL,
    "task_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "platform" VARCHAR(20) NOT NULL,
    "model" VARCHAR(100),
    "output_summary" TEXT DEFAULT '',
    "error_message" TEXT,
    "exit_code" INTEGER,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "runner_executions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_runner_executions_org" ON "public"."runner_executions"("org_id");
CREATE INDEX "idx_runner_executions_config" ON "public"."runner_executions"("config_id");
CREATE INDEX "idx_runner_executions_runner_node" ON "public"."runner_executions"("runner_node_id");
CREATE INDEX "idx_runner_executions_task" ON "public"."runner_executions"("task_id");
CREATE INDEX "idx_runner_executions_status" ON "public"."runner_executions"("status");
ALTER TABLE "public"."runner_executions" ADD CONSTRAINT "runner_executions_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE "public"."runner_executions" ADD CONSTRAINT "runner_executions_config_id_fkey"
    FOREIGN KEY ("config_id") REFERENCES "public"."runner_configs"("id") ON DELETE CASCADE;
ALTER TABLE "public"."runner_executions" ADD CONSTRAINT "runner_executions_runner_node_id_fkey"
    FOREIGN KEY ("runner_node_id") REFERENCES "public"."runner_nodes"("id") ON DELETE CASCADE;
ALTER TABLE "public"."runner_executions" ADD CONSTRAINT "runner_executions_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;
```

**Step 2: Adicionar no Prisma schema**

```prisma
model RunnerNode {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId           String           @map("org_id") @db.Uuid
  name            String           @db.VarChar(100)
  os              String           @db.VarChar(50)
  architecture    String           @db.VarChar(50)
  version         String           @db.VarChar(20)
  status          String           @default("offline") @db.VarChar(20)
  lastHeartbeatAt DateTime?        @map("last_heartbeat_at") @db.Timestamptz(6)
  createdAt       DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime         @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  organization    Organization     @relation(fields: [orgId], references: [id], onDelete: Cascade)
  configs         RunnerConfig[]
  executions      RunnerExecution[]

  @@unique([orgId, name], map: "idx_runner_nodes_org_name")
  @@index([orgId], map: "idx_runner_nodes_org")
  @@map("runner_nodes")
  @@schema("public")
}

model RunnerConfig {
  id                     String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId                  String          @map("org_id") @db.Uuid
  runnerNodeId           String          @map("runner_node_id") @db.Uuid
  name                   String          @db.VarChar(100)
  enabled                Boolean         @default(true)
  matchStatus            String[]        @default([]) @map("match_status")
  matchAssigneeId        String?         @map("match_assignee_id") @db.Uuid
  platform               String          @default("opencode") @db.VarChar(20)
  model                  String?         @db.VarChar(100)
  instruction            String?         @db.Text
  onDoneStatus           String?         @map("on_done_status") @db.VarChar(20)
  onDoneAssigneeId       String?         @map("on_done_assignee_id") @db.Uuid
  onErrorStatus          String          @default("BLOCKED") @map("on_error_status") @db.VarChar(20)
  pollingIntervalSeconds Int             @default(60) @map("polling_interval_seconds")
  maxConcurrent          Int             @default(1) @map("max_concurrent")
  timeoutMinutes         Int             @default(30) @map("timeout_minutes")
  createdAt              DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt              DateTime        @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  organization           Organization    @relation(fields: [orgId], references: [id], onDelete: Cascade)
  runnerNode             RunnerNode      @relation(fields: [runnerNodeId], references: [id], onDelete: Cascade)
  executions             RunnerExecution[]

  @@index([orgId], map: "idx_runner_configs_org")
  @@index([runnerNodeId], map: "idx_runner_configs_runner_node")
  @@map("runner_configs")
  @@schema("public")
}

model RunnerExecution {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId           String              @map("org_id") @db.Uuid
  configId        String              @map("config_id") @db.Uuid
  runnerNodeId    String              @map("runner_node_id") @db.Uuid
  taskId          String?             @map("task_id") @db.Uuid
  status          String              @default("pending") @db.VarChar(20)
  platform        String              @db.VarChar(20)
  model           String?             @db.VarChar(100)
  outputSummary   String              @default("") @db.Text @map("output_summary")
  errorMessage    String?             @map("error_message") @db.Text
  exitCode        Int?                @map("exit_code")
  startedAt       DateTime?           @map("started_at") @db.Timestamptz(6)
  finishedAt      DateTime?           @map("finished_at") @db.Timestamptz(6)
  durationMs      Int?                @map("duration_ms")
  createdAt       DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime            @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  organization    Organization        @relation(fields: [orgId], references: [id], onDelete: Cascade)
  config          RunnerConfig        @relation(fields: [configId], references: [id], onDelete: Cascade)
  runnerNode      RunnerNode          @relation(fields: [runnerNodeId], references: [id], onDelete: Cascade)
  task            Task?               @relation(fields: [taskId], references: [id], onDelete: SetNull)

  @@index([orgId], map: "idx_runner_executions_org")
  @@index([configId], map: "idx_runner_executions_config")
  @@index([runnerNodeId], map: "idx_runner_executions_runner_node")
  @@index([taskId], map: "idx_runner_executions_task")
  @@index([status], map: "idx_runner_executions_status")
  @@map("runner_executions")
  @@schema("public")
}
```

**Step 3:** Adicionar no model `Organization`:
```prisma
runnerNodes     RunnerNode[]
```

**Step 4:** Adicionar no model `Task`:
```prisma
executions      RunnerExecution[]
```

**Step 5:** Rodar migration e commit

---

## FASE 2: Repositories

### Task 2: Criar RunnerNodeRepository

**Objective:** Repository CRUD para runner_nodes.

**Files:**
- Create: `src/infra/adapters/prisma/runner-node.repository.ts`
- Modify: `src/infra/adapters/prisma/index.ts`

**Step 1:** Criar o repository seguindo o padrão do codebase:

```typescript
import type { PrismaClient } from '@prisma/client';

export class RunnerNodeRepository {
  constructor(private prisma: PrismaClient) {}

  async findByOrg(orgId: string) {
    return this.prisma.runnerNode.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.runnerNode.findUnique({ where: { id } });
  }

  async register(data: {
    orgId: string;
    name: string;
    os: string;
    architecture: string;
    version: string;
  }) {
    return this.prisma.runnerNode.upsert({
      where: { orgId_name: { orgId: data.orgId, name: data.name } },
      create: { ...data, status: 'online', lastHeartbeatAt: new Date() },
      update: {
        os: data.os, architecture: data.architecture, version: data.version,
        status: 'online', lastHeartbeatAt: new Date(),
      },
    });
  }

  async heartbeat(id: string) {
    return this.prisma.runnerNode.update({
      where: { id },
      data: { lastHeartbeatAt: new Date(), status: 'online' },
    });
  }

  async markOfflineStale(beforeDate: Date) {
    return this.prisma.runnerNode.updateMany({
      where: { lastHeartbeatAt: { lt: beforeDate } },
      data: { status: 'offline' },
    });
  }

  async delete(id: string) {
    return this.prisma.runnerNode.delete({ where: { id } });
  }
}
```

**Step 2:** Exportar no `index.ts`:
```typescript
export const runnerNodeRepository = new RunnerNodeRepository(prisma);
```

---

### Task 3: Criar RunnerConfigRepository

**Objective:** Repository CRUD para runner_configs.

**Files:**
- Create: `src/infra/adapters/prisma/runner-config.repository.ts`
- Modify: `src/infra/adapters/prisma/index.ts`

**Step 1:**

```typescript
import type { PrismaClient } from '@prisma/client';

export class RunnerConfigRepository {
  constructor(private prisma: PrismaClient) {}

  async findByOrg(orgId: string) {
    return this.prisma.runnerConfig.findMany({
      where: { orgId },
      include: { runnerNode: { select: { id: true, name: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findEnabledByOrg(orgId: string) {
    return this.prisma.runnerConfig.findMany({
      where: { orgId, enabled: true },
      include: { runnerNode: { select: { id: true, name: true, status: true } } },
    });
  }

  async findByRunnerNode(runnerNodeId: string) {
    return this.prisma.runnerConfig.findMany({
      where: { runnerNodeId, enabled: true },
    });
  }

  async findById(id: string) {
    return this.prisma.runnerConfig.findUnique({ where: { id } });
  }

  async create(data: {
    orgId: string; runnerNodeId: string; name: string;
    enabled?: boolean; matchStatus?: string[]; matchAssigneeId?: string;
    platform?: string; model?: string; instruction?: string;
    onDoneStatus?: string; onDoneAssigneeId?: string; onErrorStatus?: string;
    pollingIntervalSeconds?: number; maxConcurrent?: number; timeoutMinutes?: number;
  }) {
    return this.prisma.runnerConfig.create({ data });
  }

  async update(id: string, data: Record<string, unknown>) {
    return this.prisma.runnerConfig.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.runnerConfig.delete({ where: { id } });
  }
}
```

**Step 2:** Exportar no `index.ts`.

---

### Task 4: Criar RunnerExecutionRepository

**Objective:** Repository para runner_executions.

**Files:**
- Create: `src/infra/adapters/prisma/runner-execution.repository.ts`
- Modify: `src/infra/adapters/prisma/index.ts`

**Step 1:**

```typescript
import type { PrismaClient } from '@prisma/client';

export class RunnerExecutionRepository {
  constructor(private prisma: PrismaClient) {}

  async findByOrg(orgId: string, limit = 50) {
    return this.prisma.runnerExecution.findMany({
      where: { orgId },
      include: {
        config: { select: { id: true, name: true } },
        runnerNode: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, status: true, localId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findById(id: string) {
    return this.prisma.runnerExecution.findUnique({
      where: { id },
      include: { config: true, runnerNode: true, task: true },
    });
  }

  async findRunningByTask(taskId: string) {
    return this.prisma.runnerExecution.findFirst({
      where: { taskId, status: 'running' },
    });
  }

  async countRunningByConfig(configId: string) {
    return this.prisma.runnerExecution.count({
      where: { configId, status: 'running' },
    });
  }

  async create(data: {
    orgId: string; configId: string; runnerNodeId: string;
    taskId?: string; platform: string; model?: string;
  }) {
    return this.prisma.runnerExecution.create({
      data: { ...data, status: 'running', startedAt: new Date() },
    });
  }

  async updateOutput(id: string, outputSummary: string) {
    return this.prisma.runnerExecution.update({
      where: { id },
      data: { outputSummary },
    });
  }

  async complete(id: string, result: {
    status: 'done' | 'failed' | 'cancelled';
    outputSummary?: string;
    errorMessage?: string;
    exitCode?: number;
  }) {
    const finishedAt = new Date();
    const execution = await this.prisma.runnerExecution.findUnique({ where: { id } });
    const durationMs = execution?.startedAt
      ? finishedAt.getTime() - execution.startedAt.getTime()
      : null;

    return this.prisma.runnerExecution.update({
      where: { id },
      data: {
        status: result.status,
        finishedAt,
        durationMs,
        ...(result.outputSummary !== undefined && { outputSummary: result.outputSummary }),
        ...(result.errorMessage && { errorMessage: result.errorMessage }),
        ...(result.exitCode !== undefined && { exitCode: result.exitCode }),
      },
    });
  }
}
```

**Step 2:** Exportar no `index.ts`.

---

## FASE 3: Agent API Endpoints

### Task 5: POST /api/agent/runner/register + POST /api/agent/runner/heartbeat

**Objective:** Runner se registra e envia heartbeat periódico.

**Files:**
- Create: `src/app/api/agent/runner/register/route.ts`
- Create: `src/app/api/agent/runner/heartbeat/route.ts`

**Step 1:** Register — POST com `extractAgentAuth()`, valida com Zod, chama `runnerNodeRepository.register()`.

**Step 2:** Heartbeat — POST com `extractAgentAuth()`, recebe `nodeId`, chama `runnerNodeRepository.heartbeat()`. Também roda `markOfflineStale()` para runners sem heartbeat há 2+ minutos.

**Step 3: Commit**

---

### Task 6: GET /api/agent/runner/nodes

**Objective:** Listar runners do tenant.

**Files:**
- Create: `src/app/api/agent/runner/nodes/route.ts`

**Step 1:** GET simples — `runnerNodeRepository.findByOrg(orgId)`.

**Step 2: Commit**

---

### Task 7: CRUD /api/agent/runner/configs

**Objective:** Gerenciar configs de automação (GET, POST, PATCH, DELETE).

**Files:**
- Create: `src/app/api/agent/runner/configs/route.ts` (GET + POST)
- Create: `src/app/api/agent/runner/configs/[id]/route.ts` (PATCH + DELETE)

**Step 1:** GET — `runnerConfigRepository.findByOrg(orgId)`, opcionalmente filtrar por `?runnerNodeId=X`.

**Step 2:** POST — valida com Zod, cria config. Campos:
```typescript
{
  name: string, runnerNodeId: string, enabled?: boolean,
  matchStatus?: string[], matchAssigneeId?: string,
  platform?: 'opencode', model?: string, instruction?: string,
  onDoneStatus?: string, onDoneAssigneeId?: string, onErrorStatus?: string,
  pollingIntervalSeconds?: number, maxConcurrent?: number, timeoutMinutes?: number
}
```

**Step 3:** PATCH — atualiza qualquer campo. DELETE — deleta.

**Step 4: Commit**

---

### Task 8: CRUD /api/agent/runner/executions

**Objective:** Criar, listar e atualizar execuções. **Este é o endpoint mais crítico — orquestra o handoff.**

**Files:**
- Create: `src/app/api/agent/runner/executions/route.ts` (GET + POST)
- Create: `src/app/api/agent/runner/executions/[id]/route.ts` (PATCH)

**Imports necessários (PATCH handler):**
```typescript
import { updateTask } from '@/domain/use-cases/tasks/update-task';
import { taskRepository, auditLogRepository, runnerExecutionRepository, runnerConfigRepository } from '@/infra/adapters/prisma';
```

**Step 1: GET** — lista execuções do org. Filtros: `?runnerNodeId=X`, `?status=Y`, `?taskId=Z`.

**Step 2: POST** — cria execução. Validações:
- **Validar que a task existe e pertence ao org:** `taskRepository.findById(taskId, orgId)` — retorna 404 se não encontrar
- Verifica se não existe execução `running` para a mesma task (`runnerExecutionRepository.findRunningByTask(taskId)`)
- Verifica se o config não excede `maxConcurrent` (`runnerExecutionRepository.countRunningByConfig(configId)`)
- Cria com status `running`

**Step 3: PATCH** — atualiza status/output/error. **HANDOFF AUTOMÁTICO:**

```typescript
// 1. Atualiza a execução via runnerExecutionRepository.complete()
const execution = await runnerExecutionRepository.complete(id, {
  status: parsed.data.status,
  outputSummary: parsed.data.outputSummary,
  errorMessage: parsed.data.errorMessage,
  exitCode: parsed.data.exitCode,
});

// 2. Busca a config pra saber o que fazer no handoff
const config = await runnerConfigRepository.findById(execution.configId);

// 3. HANDOFF — só se a task existe
if (execution.taskId && config) {
  const updateData: Record<string, unknown> = {};

  if (parsed.data.status === 'done') {
    if (config.onDoneStatus) updateData.status = config.onDoneStatus;
    if (config.onDoneAssigneeId) updateData.assigneeId = config.onDoneAssigneeId;
  } else if (parsed.data.status === 'failed' && config.onErrorStatus) {
    updateData.status = config.onErrorStatus;
  }

  if (Object.keys(updateData).length > 0) {
    // Usar o use case (não o repository direto) pra ter audit log
    await updateTask(
      execution.taskId,
      execution.orgId,
      execution.orgId, // userId do org (runner não tem userId próprio)
      updateData,
      { taskRepository, auditLogRepository },
      { source: 'runner', agentName: 'FluXo Runner' }
    );
  }
}
```

**Nota sobre `updateTask`:** O use case `src/domain/use-cases/tasks/update-task.ts` já faz validação de status, audit log, e retorna a task atualizada. Usamos ele em vez de `taskRepository.update()` diretamente pra manter consistência com o resto do Agent API (ver `src/app/api/agent/tasks/[id]/route.ts:95`).

**Step 4: Commit**

---

### Task 9: POST /api/agent/runner/executions/:id/output

**Objective:** Runner envia output acumulado (últimos N chars).

**Files:**
- Create: `src/app/api/agent/runner/executions/[id]/output/route.ts`

**Step 1:**
```typescript
const outputSchema = z.object({
  output: z.string(),  // Output acumulado (runner faz slice dos últimos 10KB)
});

// POST: salva outputSummary via updateOutput()
// Responde com { received: true, outputLength: number }
```

**Step 2: Commit**

---

## FASE 4: Deploy + Testes

### Task 10: Deploy e testes end-to-end com curl

**Objective:** Validar fluxo completo.

**Teste 1: Registrar runner**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "User-Agent: Runner/0.1.0" \
  -H "Content-Type: application/json" \
  -d '{"name":"Guilherme Desktop","os":"windows","architecture":"x64","version":"0.1.0"}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/register"
```

**Teste 2: Heartbeat**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"nodeId":"<id>"}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/heartbeat"
```

**Teste 3: Criar config**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{
    "name": "Dev Auto",
    "runnerNodeId": "<id>",
    "matchStatus": ["TODO"],
    "matchAssigneeId": "<uuid>",
    "platform": "opencode",
    "model": "claude-sonnet-4",
    "instruction": "Analise a task e implemente a solução",
    "onDoneStatus": "REVIEW",
    "onDoneAssigneeId": "<uuid-qa>",
    "onErrorStatus": "BLOCKED",
    "pollingIntervalSeconds": 60,
    "timeoutMinutes": 30
  }' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/configs"
```

**Teste 4: Criar execução**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"configId":"<id>","runnerNodeId":"<id>","taskId":"<task-uuid>","platform":"opencode","model":"claude-sonnet-4"}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/executions"
```

**Teste 5: Enviar output**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"output":"$ git checkout feature/auth\n$ npm run test\n42 passing\nDone."}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/executions/<id>/output"
```

**Teste 6: Finalizar + handoff**
```bash
curl -s -X PATCH -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"status":"done","outputSummary":"Implementado com sucesso. 42 testes passando."}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/executions/<id>"
```

Verificar: task deve ter mudado de `TODO` para `REVIEW` e assignee para o QA.

**Teste 7: Verificar estado final**
```bash
curl -s -H "Authorization: Bearer agk_***" \
  "https://fluxo.agenda-aqui.com/api/agent/runner/executions?status=done" | jq .
```

---

## Resumo

| Tabela | Finalidade |
|--------|-----------|
| `runner_nodes` | Desktops conectados (nome, OS, heartbeat) |
| `runner_configs` | Regras de automação (match, execução, handoff) |
| `runner_executions` | Histórico de runs (output resumido, status, duração) |

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /agent/runner/register | Registrar runner |
| POST | /agent/runner/heartbeat | Ping de vida |
| GET | /agent/runner/nodes | Listar runners |
| GET | /agent/runner/configs | Buscar configs |
| POST | /agent/runner/configs | Criar config |
| PATCH | /agent/runner/configs/:id | Atualizar config |
| DELETE | /agent/runner/configs/:id | Deletar config |
| GET | /agent/runner/executions | Listar execuções |
| POST | /agent/runner/executions | Criar execução |
| PATCH | /agent/runner/executions/:id | Finalizar (handoff automático) |
| POST | /agent/runner/executions/:id/output | Enviar output |

**Total: 10 tasks** (vs 25 na v1)

## Segurança

1. **Command Injection:** Runner NUNCA executa comandos do config. Monta internamente a partir de `platform` + `model`.
2. **Allowlist:** Só aceita `opencode` como platform (v1).
3. **Workdir scoped:** Runner configura workdir localmente, nunca no server.
4. **Timeout:** Campo `timeoutMinutes` (default 30) — runner mata processo após timeout.
5. **Agent Key:** Autenticação via Agent API key existente.
6. **Scope:** Runner só acessa dados do seu tenant via `extractAgentAuth()`.
7. **Task validation:** POST /executions valida que a task existe e pertence ao org antes de criar execução.
8. **Concorrência:** Verifica se não há execução `running` pra mesma task (evita double-execution).

## Futuro (não nesta implementação)

- SSE para UI (push de updates quando nova execução é criada)
- Chat bidirecional (stdin/stdout do processo)
- Hermes como platform alternativa
- Tauri desktop app
- Dashboard UI com logs em tempo real
