# FluXo Runner — Implementation Plan

> **For OpenCode:** Use este plano para implementar task por task. Cada task é autocontida.

**Goal:** Criar o sistema FluXo Runner — automação de tasks via agentes locais (OpenCode, Hermes), com acompanhamento em tempo real na UI web do FluXo.

**Architecture:** O FluXo (VPS) é o orquestrador. Cada usuário instala um Runner desktop local que faz polling na Agent API, spawna o agente configurado (OpenCode/Hermes), streama output em tempo real, e faz handoff via mudança de assignee/status. A UI web do FluXo acompanha tudo.

**Tech Stack:** Next.js (App Router), Prisma, PostgreSQL, Zod, Tauri (fase 2 — app desktop).

---

## Contexto: O que já existe

### Agent API (já funciona)
- Autenticação: `extractAgentAuth()` em `src/shared/http/agent-auth.ts`
- Responses: `agentSuccess()`, `agentList()`, `agentError()`, `handleAgentError()` em `src/shared/http/agent-responses.ts`
- Padrão de rota: `src/app/api/agent/[entity]/route.ts`
- Documentação: `src/app/api/agent/route.ts` (auto-describing JSON)
- Tarefas já suportam `assigneeId` como filtro em GET /tasks

### Personal Board (já existe, só sessão)
- Tabelas: `personal_board_columns`, `personal_board_items` (Prisma)
- Repository: `personalBoardRepository` em `src/infra/adapters/prisma/index.ts`
- Rotas web: `/api/personal-board/*` (usam `extractAuthenticatedTenant` com Supabase)
- Agent API já tem os endpoints de board documentados em `src/app/api/agent/route.ts` (mas as rotas físicas precisam ser criadas)

### Infra
- Prisma com PostgreSQL
- Migrations em `prisma/migrations/`
- Repositories em `src/infra/adapters/prisma/`
- Zod pra validação em tudo
- `agentList`, `agentSuccess`, `agentError`, `handleAgentError` em `src/shared/http/agent-responses.ts`

---

## FASE 1: Personal Board na Agent API

### Task 1: Criar rota GET /api/agent/board

**Objective:** Expor o personal board completo (colunas + items) via Agent API.

**Files:**
- Create: `src/app/api/agent/board/route.ts`

**Step 1: Criar o arquivo da rota**

```typescript
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { orgId, userId } = await extractAgentAuth();
    const board = await personalBoardRepository.getBoard(orgId, userId);
    return agentSuccess(board);
  } catch (error) {
    return handleAgentError(error);
  }
}
```

**Step 2: Testar**

```bash
curl -s -H "Authorization: Bearer agk_***" -H "User-Agent: Hermes/1.0" \
  "https://fluxo.agenda-aqui.com/api/agent/board"
```

Expected: `{ "success": true, "data": { "columns": [...] } }`

**Step 3: Commit**

```bash
git add src/app/api/agent/board/route.ts
git commit -m "feat(agent-api): add GET /agent/board endpoint"
```

---

### Task 2: Criar rota POST /api/agent/board/columns

**Objective:** Criar colunas no personal board via Agent API.

**Files:**
- Create: `src/app/api/agent/board/columns/route.ts`

**Step 1: Criar a rota**

```typescript
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createColumnSchema = z.object({
  title: z.string().min(1).max(100),
  color: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await extractAgentAuth();
    const body = await request.json();
    const parsed = createColumnSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', 'Invalid data', 400);
    }

    const column = await personalBoardRepository.createColumn({
      orgId,
      userId,
      ...parsed.data,
    });

    return agentSuccess(column, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}
```

**Step 2: Testar**

```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"title": "Hoje", "color": "#6366f1"}' \
  "https://fluxo.agenda-aqui.com/api/agent/board/columns"
```

**Step 3: Commit**

```bash
git add src/app/api/agent/board/columns/route.ts
git commit -m "feat(agent-api): add POST /agent/board/columns endpoint"
```

---

### Task 3: Criar rota PATCH/DELETE /api/agent/board/columns/:id

**Objective:** Atualizar e deletar coluna via Agent API.

**Files:**
- Create: `src/app/api/agent/board/columns/[id]/route.ts`

**Step 1: Criar a rota**

```typescript
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const updateColumnSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  color: z.string().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId, userId } = await extractAgentAuth();
    const body = await request.json();

    if (!body || Object.keys(body).length === 0) {
      return agentError('VALIDATION_ERROR', 'No fields provided', 400);
    }

    const parsed = updateColumnSchema.safeParse(body);
    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', 'Invalid data', 400);
    }

    const updated = await personalBoardRepository.updateColumn(id, orgId, userId, parsed.data);
    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { orgId, userId } = await extractAgentAuth();
    await personalBoardRepository.deleteColumn(id, orgId, userId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleAgentError(error);
  }
}
```

> **Nota:** Verificar se `personalBoardRepository` tem os métodos `updateColumn` e `deleteColumn`. Se não, criar/adaptar seguindo o padrão do `updateItem`/`deleteItem`.

**Step 2: Commit**

```bash
git add src/app/api/agent/board/columns/\[id\]/route.ts
git commit -m "feat(agent-api): add PATCH/DELETE /agent/board/columns/:id"
```

---

### Task 4: Criar rota POST /api/agent/board/columns/:columnId/items

**Objective:** Criar items em uma coluna via Agent API.

**Files:**
- Create: `src/app/api/agent/board/columns/[columnId]/items/route.ts`

**Step 1: Criar a rota**

```typescript
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { personalBoardRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.string().optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ columnId: string }> }
) {
  try {
    const { columnId } = await params;
    const { orgId } = await extractAgentAuth();
    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', 'Invalid data', 400);
    }

    const item = await personalBoardRepository.createItem({
      columnId,
      ...parsed.data,
    });

    return agentSuccess(item, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/agent/board/columns/\[columnId\]/items/route.ts
git commit -m "feat(agent-api): add POST /agent/board/columns/:columnId/items"
```

---

### Task 5: Criar rotas PATCH/DELETE /api/agent/board/items/:id e POST /api/agent/board/reorder

**Objective:** Completar CRUD do personal board na Agent API.

**Files:**
- Create: `src/app/api/agent/board/items/[id]/route.ts`
- Create: `src/app/api/agent/board/reorder/route.ts`

**Step 1:** Criar `items/[id]/route.ts` com PATCH e DELETE.
- Seguir padrão de `src/app/api/personal-board/items/[itemId]/route.ts`
- Trocar `extractAuthenticatedTenant(supabase)` por `extractAgentAuth()`
- No PATCH, usar `extractAgentAuth()` para obter `orgId` e `userId`
- No DELETE, mesmo padrão

**Step 2:** Criar `reorder/route.ts` com POST.
- Seguir padrão de `src/app/api/personal-board/reorder/route.ts`
- Trocar auth para `extractAgentAuth()`
- Passar `orgId` e `userId` do auth context

**Step 3: Commit**

```bash
git add src/app/api/agent/board/
git commit -m "feat(agent-api): complete personal board CRUD endpoints"
```

---

### Task 6: Atualizar documentação do Agent API

**Objective:** Verificar se os endpoints de board estão documentados no JSON de docs.

**Files:**
- Modify: `src/app/api/agent/route.ts`

**Step 1:** Verificar no array `endpoints` de `API_DOCS` se os endpoints de board já estão documentados. O JSON de docs já inclui board, columns, items e reorder — verificar se está completo e batendo com as rotas criadas.

**Step 2:** Verificar se os models `BoardColumn` e `BoardItem` estão no objeto `models`.

**Step 3: Commit se houver alterações**

---

## FASE 2: Runner — Database + Repositories

### Task 7: Criar migration — tabela runner_nodes

**Objective:** Criar tabela que registra os runners desktop conectados.

**Files:**
- Create: `prisma/migrations/TIMESTAMP_add_runner_nodes/migration.sql`
- Modify: `prisma/schema.prisma`

**Step 1: Criar migration SQL**

```sql
CREATE TABLE "public"."runner_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "os" VARCHAR(50) NOT NULL,
    "architecture" VARCHAR(50) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'offline',
    "last_heartbeat_at" TIMESTAMPTZ(6),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "runner_nodes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_runner_nodes_org" ON "public"."runner_nodes"("org_id");
CREATE INDEX "idx_runner_nodes_status" ON "public"."runner_nodes"("status");
CREATE UNIQUE INDEX "idx_runner_nodes_org_name" ON "public"."runner_nodes"("org_id", "name");

ALTER TABLE "public"."runner_nodes" ADD CONSTRAINT "runner_nodes_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;
```

**Step 2: Adicionar no Prisma schema**

```prisma
model RunnerNode {
  id              String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId           String        @map("org_id") @db.Uuid
  name            String        @db.VarChar(100)
  os              String        @db.VarChar(50)
  architecture    String        @db.VarChar(50)
  version         String        @db.VarChar(20)
  status          String        @default("offline") @db.VarChar(20)
  lastHeartbeatAt DateTime?     @map("last_heartbeat_at") @db.Timestamptz(6)
  metadata        Json          @default("{}") @db.JsonB
  createdAt       DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime      @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  organization    Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  configs         RunnerConfig[]
  executions      RunnerExecution[]

  @@unique([orgId, name], map: "idx_runner_nodes_org_name")
  @@index([orgId], map: "idx_runner_nodes_org")
  @@index([status], map: "idx_runner_nodes_status")
  @@map("runner_nodes")
  @@schema("public")
}
```

> **Nota:** As relações `RunnerConfig[]` e `RunnerExecution[]` serão criadas nas tasks seguintes. Comentar temporariamente ou criar tudo junto.

**Step 3: Rodar migration**

```bash
npx prisma migrate dev --name add_runner_nodes
```

**Step 4: Commit**

---

### Task 8: Criar migration — tabela runner_configs

**Objective:** Tabela de regras de automação por tenant.

**Files:**
- Create: `prisma/migrations/TIMESTAMP_add_runner_configs/migration.sql`
- Modify: `prisma/schema.prisma`

**Step 1: Criar migration SQL**

```sql
CREATE TABLE "public"."runner_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "runner_node_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    "match_status" TEXT[] DEFAULT '{}',
    "match_assignee_id" UUID,
    "match_type" TEXT[] DEFAULT '{}',
    "match_project_id" UUID,

    "platform" VARCHAR(20) NOT NULL DEFAULT 'opencode',
    "model" VARCHAR(100),
    "workdir" VARCHAR(500),
    "instruction" TEXT,
    "environment" VARCHAR(20) DEFAULT 'native',

    "on_done_status" VARCHAR(20),
    "on_done_assignee_id" UUID,
    "on_error_status" VARCHAR(20) DEFAULT 'BLOCKED',

    "polling_interval_seconds" INTEGER NOT NULL DEFAULT 120,
    "max_concurrent" INTEGER NOT NULL DEFAULT 1,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "runner_configs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_runner_configs_org" ON "public"."runner_configs"("org_id");
CREATE INDEX "idx_runner_configs_runner_node" ON "public"."runner_configs"("runner_node_id");
CREATE INDEX "idx_runner_configs_enabled" ON "public"."runner_configs"("enabled");

ALTER TABLE "public"."runner_configs" ADD CONSTRAINT "runner_configs_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."runner_configs" ADD CONSTRAINT "runner_configs_runner_node_id_fkey"
    FOREIGN KEY ("runner_node_id") REFERENCES "public"."runner_nodes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
```

**Step 2: Adicionar no Prisma schema**

```prisma
model RunnerConfig {
  id                       String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId                    String        @map("org_id") @db.Uuid
  runnerNodeId             String        @map("runner_node_id") @db.Uuid
  name                     String        @db.VarChar(100)
  enabled                  Boolean       @default(true)

  matchStatus              String[]      @default([]) @map("match_status")
  matchAssigneeId          String?       @map("match_assignee_id") @db.Uuid
  matchType                String[]      @default([]) @map("match_type")
  matchProjectId           String?       @map("match_project_id") @db.Uuid

  platform                 String        @default("opencode") @db.VarChar(20)
  model                    String?       @db.VarChar(100)
  workdir                  String?       @db.VarChar(500)
  instruction              String?       @db.Text
  environment              String        @default("native") @db.VarChar(20)

  onDoneStatus             String?       @map("on_done_status") @db.VarChar(20)
  onDoneAssigneeId         String?       @map("on_done_assignee_id") @db.Uuid
  onErrorStatus            String        @default("BLOCKED") @map("on_error_status") @db.VarChar(20)

  pollingIntervalSeconds   Int           @default(120) @map("polling_interval_seconds")
  maxConcurrent            Int           @default(1) @map("max_concurrent")

  createdAt                DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime      @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization             Organization  @relation(fields: [orgId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  runnerNode               RunnerNode    @relation(fields: [runnerNodeId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  executions               RunnerExecution[]

  @@index([orgId], map: "idx_runner_configs_org")
  @@index([runnerNodeId], map: "idx_runner_configs_runner_node")
  @@index([enabled], map: "idx_runner_configs_enabled")
  @@map("runner_configs")
  @@schema("public")
}
```

**Step 3: Rodar migration e commit**

---

### Task 9: Criar migration — tabelas runner_executions e runner_chat_messages

**Objective:** Tabela de execuções (runs) com log de output e chat bidirecional.

**Files:**
- Create: `prisma/migrations/TIMESTAMP_add_runner_executions/migration.sql`
- Modify: `prisma/schema.prisma`

**Step 1: Criar migration SQL**

```sql
CREATE TABLE "public"."runner_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "config_id" UUID NOT NULL,
    "runner_node_id" UUID NOT NULL,
    "task_id" UUID,

    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "platform" VARCHAR(20) NOT NULL,
    "model" VARCHAR(100),
    "workdir" VARCHAR(500),

    "output" TEXT DEFAULT '',

    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "duration_ms" INTEGER,

    "error_message" TEXT,

    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "runner_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."runner_chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "execution_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "runner_chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_runner_executions_org" ON "public"."runner_executions"("org_id");
CREATE INDEX "idx_runner_executions_config" ON "public"."runner_executions"("config_id");
CREATE INDEX "idx_runner_executions_runner_node" ON "public"."runner_executions"("runner_node_id");
CREATE INDEX "idx_runner_executions_task" ON "public"."runner_executions"("task_id");
CREATE INDEX "idx_runner_executions_status" ON "public"."runner_executions"("status");
CREATE INDEX "idx_runner_chat_messages_execution" ON "public"."runner_chat_messages"("execution_id");

ALTER TABLE "public"."runner_executions" ADD CONSTRAINT "runner_executions_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."runner_executions" ADD CONSTRAINT "runner_executions_config_id_fkey"
    FOREIGN KEY ("config_id") REFERENCES "public"."runner_configs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."runner_executions" ADD CONSTRAINT "runner_executions_runner_node_id_fkey"
    FOREIGN KEY ("runner_node_id") REFERENCES "public"."runner_nodes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."runner_executions" ADD CONSTRAINT "runner_executions_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."runner_chat_messages" ADD CONSTRAINT "runner_chat_messages_execution_id_fkey"
    FOREIGN KEY ("execution_id") REFERENCES "public"."runner_executions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
```

**Step 2: Adicionar no Prisma schema**

```prisma
model RunnerExecution {
  id              String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId           String              @map("org_id") @db.Uuid
  configId        String              @map("config_id") @db.Uuid
  runnerNodeId    String              @map("runner_node_id") @db.Uuid
  taskId          String?             @map("task_id") @db.Uuid

  status          String              @default("pending") @db.VarChar(20)
  platform        String              @db.VarChar(20)
  model           String?             @db.VarChar(100)
  workdir         String?             @db.VarChar(500)

  output          String              @default("") @db.Text

  startedAt       DateTime?           @map("started_at") @db.Timestamptz(6)
  finishedAt      DateTime?           @map("finished_at") @db.Timestamptz(6)
  durationMs      Int?                @map("duration_ms")

  errorMessage    String?             @map("error_message") @db.Text

  metadata        Json                @default("{}") @db.JsonB
  createdAt       DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime            @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization    Organization        @relation(fields: [orgId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  config          RunnerConfig        @relation(fields: [configId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  runnerNode      RunnerNode          @relation(fields: [runnerNodeId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  task            Task?               @relation(fields: [taskId], references: [id], onDelete: SetNull, onUpdate: NoAction)
  chatMessages    RunnerChatMessage[]

  @@index([orgId], map: "idx_runner_executions_org")
  @@index([configId], map: "idx_runner_executions_config")
  @@index([runnerNodeId], map: "idx_runner_executions_runner_node")
  @@index([taskId], map: "idx_runner_executions_task")
  @@index([status], map: "idx_runner_executions_status")
  @@map("runner_executions")
  @@schema("public")
}

model RunnerChatMessage {
  id           String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  executionId  String           @map("execution_id") @db.Uuid
  role         String           @db.VarChar(20)
  content      String           @db.Text
  createdAt    DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)

  execution    RunnerExecution  @relation(fields: [executionId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([executionId], map: "idx_runner_chat_messages_execution")
  @@map("runner_chat_messages")
  @@schema("public")
}
```

**Step 3:** Adicionar a relation no model `Task`:

```prisma
// Dentro do model Task, adicionar:
executions    RunnerExecution[]
```

**Step 4:** Rodar migration e commit

---

### Task 10: Criar RunnerNodeRepository

**Objective:** Repository com métodos CRUD para runner_nodes.

**Files:**
- Create: `src/infra/adapters/prisma/runner-node.repository.ts`
- Modify: `src/infra/adapters/prisma/index.ts`

**Step 1: Criar o repository**

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

  async findByOrgAndName(orgId: string, name: string) {
    return this.prisma.runnerNode.findUnique({
      where: { orgId_name: { orgId, name } },
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
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.runnerNode.upsert({
      where: { orgId_name: { orgId: data.orgId, name: data.name } },
      create: {
        ...data,
        status: 'online',
        lastHeartbeatAt: new Date(),
        metadata: data.metadata ?? {},
      },
      update: {
        os: data.os,
        architecture: data.architecture,
        version: data.version,
        status: 'online',
        lastHeartbeatAt: new Date(),
        metadata: data.metadata ?? {},
      },
    });
  }

  async heartbeat(id: string) {
    return this.prisma.runnerNode.update({
      where: { id },
      data: { lastHeartbeatAt: new Date(), status: 'online' },
    });
  }

  async markOffline(id: string) {
    return this.prisma.runnerNode.update({
      where: { id },
      data: { status: 'offline' },
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

**Step 3: Commit**

---

### Task 11: Criar RunnerConfigRepository

**Objective:** Repository com métodos CRUD para runner_configs.

**Files:**
- Create: `src/infra/adapters/prisma/runner-config.repository.ts`
- Modify: `src/infra/adapters/prisma/index.ts`

**Step 1: Criar o repository**

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
    return this.prisma.runnerConfig.findUnique({
      where: { id },
      include: { runnerNode: { select: { id: true, name: true, status: true } } },
    });
  }

  async create(data: {
    orgId: string;
    runnerNodeId: string;
    name: string;
    enabled?: boolean;
    matchStatus?: string[];
    matchAssigneeId?: string;
    matchType?: string[];
    matchProjectId?: string;
    platform?: string;
    model?: string;
    workdir?: string;
    instruction?: string;
    environment?: string;
    onDoneStatus?: string;
    onDoneAssigneeId?: string;
    onErrorStatus?: string;
    pollingIntervalSeconds?: number;
    maxConcurrent?: number;
  }) {
    return this.prisma.runnerConfig.create({ data });
  }

  async update(id: string, orgId: string, data: Record<string, unknown>) {
    return this.prisma.runnerConfig.update({
      where: { id, orgId },
      data,
    });
  }

  async delete(id: string, orgId: string) {
    return this.prisma.runnerConfig.delete({ where: { id, orgId } });
  }

  async findMatchingConfigs(orgId: string, runnerNodeId: string, status: string, assigneeId?: string) {
    return this.prisma.runnerConfig.findMany({
      where: {
        orgId,
        runnerNodeId,
        enabled: true,
        matchStatus: { has: status },
        ...(assigneeId ? { matchAssigneeId: assigneeId } : {}),
      },
    });
  }
}
```

**Step 2:** Exportar no `index.ts`.

**Step 3: Commit**

---

### Task 12: Criar RunnerExecutionRepository

**Objective:** Repository com métodos CRUD para runner_executions e runner_chat_messages.

**Files:**
- Create: `src/infra/adapters/prisma/runner-execution.repository.ts`
- Modify: `src/infra/adapters/prisma/index.ts`

**Step 1: Criar o repository**

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
        task: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findByRunnerNode(runnerNodeId: string, limit = 50) {
    return this.prisma.runnerExecution.findMany({
      where: { runnerNodeId },
      include: {
        config: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async findById(id: string) {
    return this.prisma.runnerExecution.findUnique({
      where: { id },
      include: {
        config: true,
        runnerNode: { select: { id: true, name: true, status: true } },
        task: true,
        chatMessages: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async create(data: {
    orgId: string;
    configId: string;
    runnerNodeId: string;
    taskId?: string;
    platform: string;
    model?: string;
    workdir?: string;
  }) {
    return this.prisma.runnerExecution.create({
      data: {
        ...data,
        status: 'running',
        startedAt: new Date(),
      },
    });
  }

  async updateOutput(id: string, output: string) {
    return this.prisma.runnerExecution.update({
      where: { id },
      data: { output },
    });
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: { output?: string; errorMessage?: string }
  ) {
    const data: Record<string, unknown> = { status };

    if (['done', 'failed', 'cancelled'].includes(status)) {
      data.finishedAt = new Date();
    }

    if (extra?.output !== undefined) data.output = extra.output;
    if (extra?.errorMessage) data.errorMessage = extra.errorMessage;

    return this.prisma.runnerExecution.update({
      where: { id },
      data,
    });
  }

  async addChatMessage(executionId: string, role: string, content: string) {
    return this.prisma.runnerChatMessage.create({
      data: { executionId, role, content },
    });
  }

  async getChatMessages(executionId: string, since?: Date) {
    return this.prisma.runnerChatMessage.findMany({
      where: {
        executionId,
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: 'asc' },
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
}
```

> **Nota sobre output:** O runner envia o output acumulado (não incremental) em cada stream POST. O repository simplesmente substitui o campo `output`. Isso simplifica e evita problemas com concatenação no Prisma.

**Step 2:** Exportar no `index.ts`.

**Step 3: Commit**

---

## FASE 3: Agent API Endpoints — Runner

### Task 13: Criar POST /api/agent/runner/register

**Objective:** Runner se registra ao iniciar.

**Files:**
- Create: `src/app/api/agent/runner/register/route.ts`

**Step 1: Criar a rota**

```typescript
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { runnerNodeRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  os: z.string().min(1).max(50),
  architecture: z.string().min(1).max(50),
  version: z.string().min(1).max(20),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const { orgId } = await extractAgentAuth();
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', 'Invalid data', 400);
    }

    const node = await runnerNodeRepository.register({
      orgId,
      ...parsed.data,
      metadata: parsed.data.metadata ?? {},
    });

    return agentSuccess(node, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}
```

**Step 2: Testar**

```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"name":"Guilherme Desktop","os":"windows","architecture":"x64","version":"0.1.0"}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/register"
```

Expected: `{ "success": true, "data": { "id": "uuid", "name": "Guilherme Desktop", "status": "online", ... } }`

**Step 3: Commit**

---

### Task 14: Criar POST /api/agent/runner/heartbeat

**Objective:** Runner envia ping periódico. Marca runners offline se sem heartbeat há 2 min.

**Files:**
- Create: `src/app/api/agent/runner/heartbeat/route.ts`

**Step 1: Criar a rota**

```typescript
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { runnerNodeRepository } from '@/infra/adapters/prisma';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const heartbeatSchema = z.object({
  nodeId: z.string().uuid(),
  activeExecutions: z.number().default(0),
});

export async function POST(request: Request) {
  try {
    const { orgId } = await extractAgentAuth();
    const body = await request.json();
    const parsed = heartbeatSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', 'Invalid data', 400);
    }

    const node = await runnerNodeRepository.heartbeat(parsed.data.nodeId);
    if (!node || node.orgId !== orgId) {
      return agentError('NOT_FOUND', 'Runner node not found', 404);
    }

    // Marca runners offline se sem heartbeat há 2 minutos
    await runnerNodeRepository.markOfflineStale(
      new Date(Date.now() - 2 * 60 * 1000)
    );

    return agentSuccess({
      id: node.id,
      status: node.status,
      lastHeartbeatAt: node.lastHeartbeatAt,
    });
  } catch (error) {
    return handleAgentError(error);
  }
}
```

**Step 2: Commit**

---

### Task 15: Criar GET /api/agent/runner/configs

**Objective:** Runner busca suas configs de automação.

**Files:**
- Create: `src/app/api/agent/runner/configs/route.ts`

**Step 1: Criar a rota (GET)**

```typescript
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { runnerConfigRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { orgId } = await extractAgentAuth();
    const { searchParams } = new URL(request.url);
    const runnerNodeId = searchParams.get('runnerNodeId');

    const configs = runnerNodeId
      ? await runnerConfigRepository.findByRunnerNode(runnerNodeId)
      : await runnerConfigRepository.findEnabledByOrg(orgId);

    return agentSuccess(configs);
  } catch (error) {
    return handleAgentError(error);
  }
}
```

**Step 2: Commit**

---

### Task 16: Criar POST /api/agent/runner/configs

**Objective:** Criar config de automação via Agent API.

**Files:**
- Modify: `src/app/api/agent/runner/configs/route.ts`

**Step 1: Adicionar POST na rota existente**

```typescript
const createConfigSchema = z.object({
  name: z.string().min(1).max(100),
  runnerNodeId: z.string().uuid(),
  enabled: z.boolean().default(true),

  matchStatus: z.array(z.string()).default([]),
  matchAssigneeId: z.string().uuid().optional(),
  matchType: z.array(z.string()).default([]),
  matchProjectId: z.string().uuid().optional(),

  platform: z.enum(['opencode', 'hermes']).default('opencode'),
  model: z.string().max(100).optional(),
  workdir: z.string().max(500).optional(),
  instruction: z.string().optional(),
  environment: z.enum(['native', 'wsl']).default('native'),

  onDoneStatus: z.string().max(20).optional(),
  onDoneAssigneeId: z.string().uuid().optional(),
  onErrorStatus: z.string().max(20).default('BLOCKED'),

  pollingIntervalSeconds: z.number().int().min(30).max(3600).default(120),
  maxConcurrent: z.number().int().min(1).max(5).default(1),
});

export async function POST(request: Request) {
  try {
    const { orgId } = await extractAgentAuth();
    const body = await request.json();
    const parsed = createConfigSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', 'Invalid data', 400);
    }

    const config = await runnerConfigRepository.create({
      orgId,
      ...parsed.data,
    });

    return agentSuccess(config, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}
```

**Step 2: Commit**

---

### Task 17: Criar PATCH/DELETE /api/agent/runner/configs/:id

**Objective:** Atualizar e deletar configs.

**Files:**
- Create: `src/app/api/agent/runner/configs/[id]/route.ts`

**Step 1:**

PATCH com body parcial (todos os campos do create são opcionais exceto `name`). DELETE simples. Ambos verificam `orgId` do auth.

```typescript
const updateConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  enabled: z.boolean().optional(),
  matchStatus: z.array(z.string()).optional(),
  matchAssigneeId: z.string().uuid().optional().nullable(),
  matchType: z.array(z.string()).optional(),
  matchProjectId: z.string().uuid().optional().nullable(),
  platform: z.enum(['opencode', 'hermes']).optional(),
  model: z.string().max(100).optional().nullable(),
  workdir: z.string().max(500).optional().nullable(),
  instruction: z.string().optional().nullable(),
  environment: z.enum(['native', 'wsl']).optional(),
  onDoneStatus: z.string().max(20).optional().nullable(),
  onDoneAssigneeId: z.string().uuid().optional().nullable(),
  onErrorStatus: z.string().max(20).optional(),
  pollingIntervalSeconds: z.number().int().min(30).max(3600).optional(),
  maxConcurrent: z.number().int().min(1).max(5).optional(),
});
```

**Step 2: Commit**

---

### Task 18: Criar GET/POST /api/agent/runner/executions

**Objective:** Listar e criar execuções.

**Files:**
- Create: `src/app/api/agent/runner/executions/route.ts`

**Step 1: GET — lista execuções do org**

```typescript
// Query params: ?runnerNodeId=X, ?status=Y, ?taskId=Z, ?limit=N
// Include config name, runner name, task title
```

**Step 2: POST — cria execução**

```typescript
const createExecutionSchema = z.object({
  configId: z.string().uuid(),
  runnerNodeId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  platform: z.string(),
  model: z.string().optional(),
  workdir: z.string().optional(),
});

// Verifica se já existe execução rodando para a mesma task
// Verifica se o config não excede maxConcurrent
// Cria com status 'running' e startedAt
```

**Step 3: Commit**

---

### Task 19: Criar PATCH /api/agent/runner/executions/:id

**Objective:** Atualizar execução (done, failed, output). **Este endpoint faz o handoff automático.**

**Files:**
- Create: `src/app/api/agent/runner/executions/[id]/route.ts`

**Step 1:**

```typescript
const updateExecutionSchema = z.object({
  status: z.enum(['running', 'done', 'failed', 'cancelled']).optional(),
  output: z.string().optional(),
  errorMessage: z.string().optional(),
});

// PATCH: atualiza status, output, errorMessage
// Se status = done/failed/cancelled, seta finishedAt e calcula durationMs

// HANDOFF AUTOMÁTICO (importante!):
// 1. Busca a config da execução
// 2. Se status = 'done' E config.onDoneStatus existe:
//    PATCH /api/agent/tasks/:taskId { status: config.onDoneStatus }
// 3. Se status = 'done' E config.onDoneAssigneeId existe:
//    PATCH /api/agent/tasks/:taskId { assigneeId: config.onDoneAssigneeId }
// 4. Se status = 'failed' E config.onErrorStatus existe:
//    PATCH /api/agent/tasks/:taskId { status: config.onErrorStatus }
//
// NOTA: Usar taskRepository.update() diretamente (chamada interna),
// não HTTP request. Ou usar o taskRepository.findUnique() + update().
```

> **Este é o endpoint mais crítico** — ele orquestra o handoff entre agentes. Quando o Hermes Dev termina, ele chama PATCH com `status: 'done'`, e este endpoint automaticamente muda a task pra "QA READY" e atribui pro Hermes QA.

**Step 2: Commit**

---

### Task 20: Criar POST /api/agent/runner/executions/:id/stream

**Objective:** Runner envia chunks de output. UI web pode fazer polling aqui.

**Files:**
- Create: `src/app/api/agent/runner/executions/[id]/stream/route.ts`

**Step 1:**

```typescript
const streamSchema = z.object({
  output: z.string(),       // Output acumulado até o momento (não incremental)
});

// POST: salva o output completo no execution via updateOutput()
// Responde com mensagens de chat pendentes (since last heartbeat do runner)
```

**Step 2: Commit**

---

### Task 21: Criar POST/GET /api/agent/runner/executions/:id/chat

**Objective:** Chat bidirecional entre UI web e agente rodando localmente.

**Files:**
- Create: `src/app/api/agent/runner/executions/[id]/chat/route.ts`

**Step 1:**

```typescript
// POST: body { role: 'user' | 'agent', content: '...' }
// Salva no runner_chat_messages via addChatMessage()

// GET: ?since=<ISO timestamp>
// Retorna mensagens do chat da execução
// Se ?since fornecido, só mensagens após esse timestamp
```

**Fluxo do chat:**
```
1. Usuário escreve na UI web → POST /chat { role: 'user', content: 'troca hash pra bcrypt' }
2. Runner faz GET /chat e vê a nova mensagem
3. Runner escreve no stdin do processo (OpenCode/Hermes)
4. Processo responde, runner captura stdout
5. Runner faz POST /chat { role: 'agent', content: 'Ok, alterando...' }
6. UI web faz GET /chat e vê a resposta
```

**Step 2: Commit**

---

### Task 22: Criar GET /api/agent/runner/nodes

**Objective:** Listar runners do tenant.

**Files:**
- Create: `src/app/api/agent/runner/nodes/route.ts`

**Step 1:** GET simples — `runnerNodeRepository.findByOrg(orgId)`.

**Step 2: Commit**

---

### Task 23: Atualizar documentação do Agent API (Runner endpoints)

**Objective:** Adicionar todos os endpoints de runner no JSON de docs.

**Files:**
- Modify: `src/app/api/agent/route.ts`

**Step 1:** Adicionar no array `endpoints`:

```
POST   /api/agent/runner/register
POST   /api/agent/runner/heartbeat
GET    /api/agent/runner/nodes
GET    /api/agent/runner/configs
POST   /api/agent/runner/configs
PATCH  /api/agent/runner/configs/:id
DELETE /api/agent/runner/configs/:id
GET    /api/agent/runner/executions
POST   /api/agent/runner/executions
PATCH  /api/agent/runner/executions/:id
POST   /api/agent/runner/executions/:id/stream
GET    /api/agent/runner/executions/:id/chat
POST   /api/agent/runner/executions/:id/chat
```

**Step 2:** Adicionar models `RunnerNode`, `RunnerConfig`, `RunnerExecution`, `RunnerChatMessage`.

**Step 3: Commit**

---

## FASE 4: Deploy + Testes

### Task 24: Deploy e testes end-to-end com curl

**Objective:** Validar fluxo completo.

**Teste 1: Registrar runner**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"name":"Test Runner","os":"windows","architecture":"x64","version":"0.1.0"}' \
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
    "environment": "wsl",
    "workdir": "/mnt/c/Users/guilh/projetos/fluxo",
    "onDoneStatus": "QA READY",
    "onDoneAssigneeId": "<uuid-qa>",
    "onErrorStatus": "BLOCKED",
    "pollingIntervalSeconds": 120
  }' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/configs"
```

**Teste 4: Criar execução**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"configId":"<id>","runnerNodeId":"<id>","taskId":"<task-uuid>","platform":"opencode"}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/executions"
```

**Teste 5: Stream output**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"output":"git checkout feature/auth\nnpm run test\n42 passing\n"}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/executions/<id>/stream"
```

**Teste 6: Finalizar + handoff automático**
```bash
curl -s -X PATCH -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"status":"done","output":"...full output..."}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/executions/<id>"
```

Verificar: a task deve ter mudado de status e assignee automaticamente.

**Teste 7: Chat**
```bash
curl -s -X POST -H "Authorization: Bearer agk_***" -H "Content-Type: application/json" \
  -d '{"role":"user","content":"troca o hash pra bcrypt"}' \
  "https://fluxo.agenda-aqui.com/api/agent/runner/executions/<id>/chat"
```

---

## FASE 5: Hermes Skill (Runner MVP — Opcional)

### Task 25: Criar skill `fluxo-runner`

**Objective:** Skill do Hermes que funciona como runner CLI.

**Files:**
- Create: `~/.hermes/profiles/personal/skills/fluxo-runner/SKILL.md`

**Conteúdo:**

```markdown
---
name: fluxo-runner
description: Act as a FluXo Runner — poll Agent API for tasks matching automation configs, execute with OpenCode/Hermes, and handoff.
---

# FluXo Runner Skill

## Overview
Poll the FluXo Agent API for tasks that match automation configs, execute them locally with OpenCode or Hermes, stream output, and perform handoff.

## Prerequisites
- FLUXO_AGENT_KEY in environment
- FLUXO_API_URL (default: https://fluxo.agenda-aqui.com/api/agent)

## Workflow

1. Register: POST /runner/register { name, os, architecture, version }
2. Fetch configs: GET /runner/configs?runnerNodeId=<id>
3. For each enabled config:
   a. GET /tasks?assigneeId=<matchAssigneeId>&status=<matchStatus[0]>
   b. Skip tasks with running executions
   c. POST /runner/executions { configId, runnerNodeId, taskId, platform, model }
   d. Spawn: `wsl -e opencode --model <model>` or `hermes` with task description as prompt
   e. Stream output: POST /runner/executions/:id/stream every 5s
   f. On completion: PATCH /runner/executions/:id { status: 'done', output: '...' }
   g. Check chat: GET /runner/executions/:id/chat
   h. If new user messages, write to stdin of running process
4. Heartbeat: POST /runner/heartbeat { nodeId: <id> } every 30s

## Security
- NEVER execute arbitrary commands from the config
- Only spawn allowlisted executables: opencode, hermes, git
- Always set CWD to the configured workdir
- Kill processes after 30min timeout

## Environment Handling
- If config.environment === 'wsl', prefix commands with `wsl -e`
- Convert Windows paths to WSL paths when needed
```

---

## Resumo das Tabelas

| Tabela | Finalidade |
|--------|-----------|
| `runner_nodes` | Desktops conectados (nome, OS, status, heartbeat) |
| `runner_configs` | Regras de automação (match, execução, handoff) |
| `runner_executions` | Histórico de runs (output, status, duração, erros) |
| `runner_chat_messages` | Chat bidirecional durante execução |

## Resumo dos Endpoints

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
| PATCH | /agent/runner/executions/:id | Atualizar (done/failed/output + handoff) |
| POST | /agent/runner/executions/:id/stream | Stream output em tempo real |
| GET | /agent/runner/executions/:id/chat | Buscar mensagens |
| POST | /agent/runner/executions/:id/chat | Enviar mensagem |

## Segurança

1. **Command Injection:** Runner NUNCA executa comandos do config. Monta internamente a partir de `platform` + `model` + `workdir`.
2. **Allowlist:** Só aceita `opencode`, `hermes`, `git`.
3. **Workdir scoped:** Processo nunca sai do workdir configurado.
4. **Timeout:** Matar processo após 30 min.
5. **Agent Key:** Criptografada no storage local (Tauri).
6. **Scope:** Runner só acessa dados do seu tenant.
7. **No inbound:** Runner só faz HTTPS outbound. Sem portas abertas.
