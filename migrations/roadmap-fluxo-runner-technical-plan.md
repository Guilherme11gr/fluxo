Revisão do plano com base nos objetivos do FluXo
Se eu revisar isso agora com os objetivos explícitos de arquitetura bem pensada, testável, estável, escalável, robusta e com controle de tokens, eu refinaria assim:

Objetivos primários do FluXo nesta fase
- manter a base distribuída já validada em produção
- transformar o runner em runtime controlado, não em prompt gigante
- padronizar saída e side effects antes de automatizar mais coisas
- separar claramente policy, runtime, knowledge e execution result
- preparar branch/PR e routines sem acoplar o sistema a worktree obrigatório
- manter custo de contexto previsível por run

Objetivos secundários
- UI/admin para o que é produto
- backend/runner-only para o que é operacional e sensível
- compatibilidade incremental com o que já existe hoje em Agent.config e AgentExecution

Minha revisão da ordem original
- a direção geral continua correta
- eu só mudaria a ordem de implementação para colocar structured result antes do branch workflow completo
- e colocaria runtime binding antes de qualquer memory/skill runtime real

Ordem recomendada revisada
1. rolePrompt + operatingRules + output contract
2. ExecutionResult estruturado
3. ProjectRuntimeBinding / runtime resolution
4. git policy + branch workflow + PR opening
5. memory v1
6. microskill v1
7. routines first-class

Por que essa ordem é melhor
- output estruturado vira contrato entre runner, backend, UI e futuras rotinas
- runtime binding resolve segurança e previsibilidade antes de mexer com git real
- branch/PR fica muito mais simples quando execution já sabe baseBranch, repoPath e executionMode
- memory e microskills sem output estruturado viram lixo textual difícil de filtrar
- routines sem idempotency e sem structured result só escalam caos

O que copiar do Paperclip e o que não copiar
Depois de revisar os patterns atuais do Paperclip, eu copiaria a filosofia, mas não o produto inteiro.

O que copiar do Paperclip
- separação forte entre route, service e validator/shared schema
- skill library separada da materialização runtime da skill
- runtime/workspace policy separada de agent config casual
- rotina como entidade de produto, não mero cron disperso
- revisões/snapshots de rotina para auditabilidade e restore
- idempotency/coalescing em dispatch automatizado
- tratamento de execution workspace/runtime como concern de backend/service, não de prompt

Patterns concretos do Paperclip que valem ouro
- routes finas chamando service e validadores compartilhados
- rotina com trigger + revision + run history, não só uma linha de cron
- dispatch fingerprint para evitar duplicação/coalescing errado
- skill desejada no agent e skill materializada no runtime como coisas diferentes
- runtime config mergeado a partir de metadata/config, sem explodir a UI comum

O que eu não copiaria do Paperclip neste momento
- complexidade de plugin-managed resources no v1
- surface area completa de company control plane
- worktree-first como centro da arquitetura
- matriz muito grande de adapters/runtime modes antes de fechar o fluxo principal
- sync completo de skills remotas/GitHub/registry no primeiro passo

Resumo prático
- copiar: contratos, separação de camadas, idempotência, runtime injection, snapshots
- não copiar: amplitude do produto, plugin layer, over-engineering de runtime no v1

Arquitetura alvo recomendada para o FluXo
Eu dividiria a arquitetura em 6 camadas explícitas.

Camada 1: Execution Control Plane
Já existe parcialmente hoje.

Responsabilidades
- pickup seguro por status + assigneeAgentId
- lease por projeto
- heartbeat runner/execution
- finalize idempotente
- eventos incrementais

Base atual do FluXo que deve ser preservada
- Task + assigneeAgentId
- RunnerInstance
- ExecutionLease
- AgentExecution
- AgentExecutionEvent
- claim-next
- finalize

Essa camada não deve aprender business knowledge. Ela só orquestra execução.

Camada 2: Agent Role Policy
Faz o runner deixar de ser `config.context` solto.

V1: manter em `Agent.config`
- role: builder | reviewer | qa | ops | custom
- role_prompt
- operating_rules
- output_schema_version
- memory_scopes
- skill_bindings
- git_policy_override

Exemplo de shape em `Agent.config`
{
  "model": "ollama-cloud/glm-5.1",
  "agent_type": "build",
  "role": "builder",
  "role_prompt": "Você implementa tarefas em branch isolada e nunca mergeia sozinho.",
  "operating_rules": [
    "Não altere main/master diretamente.",
    "Priorize mudanças mínimas e verificáveis.",
    "Sempre produza resultado estruturado."
  ],
  "output_schema_version": "v1",
  "memory_scopes": ["project", "org"],
  "skill_bindings": ["next-build-debug", "review-checklist-next-app"]
}

Camada 3: Runtime Policy
Esse é o equivalente FluXo do que no Paperclip fica espalhado entre workspace/runtime/worktree config, mas com foco no nosso produto.

Nova entidade recomendada
- ProjectRuntimeBinding

Shape sugerido
- id
- orgId
- projectId
- runnerProfile
- hostOs: windows | linux | macos
- repoPath
- defaultBaseBranch
- allowedBranchPrefix
- executionMode: shared_project | branch_per_task | worktree_future
- gitProvider: github
- prPolicy: disabled | draft | ready
- gitPolicy: no_write | branch_only | branch_commit_pr
- metadata
- createdAt
- updatedAt

Opcional futuro
- RunnerProfile
  - name
  - hostOs
  - hostname pattern
  - capabilities
  - repoRoots
  - tool availability

Resolução recomendada
- RunnerInstance envia capabilities/metadata no registro ou heartbeat
- backend resolve binding por projectId + hostOs + runnerProfile
- claim-next ou preflight retorna runtime resolution pronta
- AgentExecution nasce com snapshot dessa resolução

Eu manteria no AgentExecution os campos conceituais já existentes e adicionaria git snapshot em metadata primeiro
- workspaceMode
- workspaceRef
- workspacePath
- metadata.runtimeBinding
- metadata.git

Camada 4: Structured Execution Result
Essa camada deve vir cedo porque é o contrato mais importante do sistema.

Nova entidade conceitual
- ExecutionResult

No v1 eu não criaria tabela separada. Eu persistiria em `AgentExecution.metadata.result`.

Shape recomendado v1
{
  "schemaVersion": "v1",
  "status": "success",
  "summary": "Implementei X para resolver Y.",
  "whatChanged": [
    "Ajustado claim do runner para usar runtime binding resolvido"
  ],
  "decisions": [
    "Mantido Agent.config como envelope de role para evitar migration prematura"
  ],
  "risks": [
    "Typecheck global ainda possui falhas preexistentes fora do escopo"
  ],
  "checksRun": [
    { "name": "go test ./...", "status": "passed", "details": null }
  ],
  "filesTouched": [
    "runner-go/internal/runner/prompt.go"
  ],
  "git": {
    "mode": "branch_commit_pr",
    "baseBranch": "main",
    "branch": "agent/agq-123-builder",
    "commitShas": [],
    "prUrl": null,
    "prNumber": null
  },
  "followups": [],
  "memoryCandidates": [],
  "skillCandidates": []
}

Campos derivados continuam existindo por compatibilidade
- resultSummary
- errorMessage
- output

Mas a regra passa a ser
- machine-readable first
- comment/UI/render derivado depois

Camada 5: Knowledge Layer
Separar desde o dia 1:
- Memory = fato, contexto, decisão, incidente, resumo
- Microskill = procedimento operacional reutilizável

Isso é muito importante para não voltar ao anti-pattern de prompt inchado.

Camada 6: Automation Layer
Routines entram aqui, mas só depois dos contratos anteriores estarem firmes.

Entidades e contratos concretos sugeridos
Eu seguiria com o menor conjunto de entidades novas capaz de sustentar a próxima fase.

ProjectRuntimeBinding
Tabela nova.

Campos
- id
- orgId
- projectId
- runnerProfile
- hostOs
- repoPath
- defaultBaseBranch
- allowedBranchPrefix
- executionMode
- gitPolicy
- prPolicy
- metadata jsonb
- createdAt
- updatedAt

Índices
- unique(orgId, projectId, runnerProfile, hostOs)
- index(orgId, projectId)

Uso
- resolução de path seguro
- resolução de base branch
- policy de branch/PR por projeto

MemoryEntry
Tabela nova.

Campos
- id
- orgId
- projectId nullable
- type: doc | decision | execution_summary | incident_fix | command_knowledge
- title
- content
- sourceExecutionId nullable
- sourceTaskId nullable
- tags string[]
- embedding vector nullable
- metadata jsonb
- createdAt
- updatedAt

Índices
- index(orgId, projectId, type)
- ivfflat/hnsw no embedding quando ativar pgvector

Microskill
Tabela nova.

Campos
- id
- orgId
- projectId nullable
- key
- slug
- title
- scope: global | project | environment
- whenToUse
- instructions
- examples jsonb
- trustLevel: draft | validated | deprecated
- sourceExecutionId nullable
- lastValidatedAt nullable
- embedding nullable
- metadata jsonb
- createdAt
- updatedAt

Índices
- unique(orgId, key)
- index(orgId, projectId, scope)

Routine
Não precisa entrar no primeiro migration. Mas o shape eu já fecharia.

Campos
- id
- orgId
- projectId nullable
- title
- description
- assigneeAgentId
- status: draft | active | paused | archived
- concurrencyPolicy: coalesce | skip_if_active | enqueue
- variables jsonb
- latestRevisionId nullable
- latestRevisionNumber
- createdAt
- updatedAt

Tabelas associadas
- RoutineTrigger
- RoutineRevision
- RoutineRun

Eu copiaria do Paperclip a ideia de revision snapshot da rotina, não só update simples.

Contratos de API recomendados
Eu evitaria criar muita rota de uma vez. Faria por fatias.

Fase role/output
- PATCH /api/agent/agents/:id
  - aceita role, role_prompt, operating_rules, output_schema_version, memory_scopes, skill_bindings dentro de config

Fase runtime binding
- GET /api/agent/runtime-binding/resolve?projectId=...&agentId=...
  - retorna repoPath, baseBranch, executionMode, gitPolicy, prPolicy

ou
- claim-next já retorna runtimeBinding embutido

Minha preferência
- claim-next retornar runtimeBinding snapshot
- evita roundtrip extra
- aumenta consistência da execution

Shape sugerido no claim-next response
{
  "task": { ... },
  "execution": { ... },
  "lease": { ... },
  "runtimeBinding": {
    "repoPath": "D:\\code\\fluxo",
    "defaultBaseBranch": "main",
    "executionMode": "branch_per_task",
    "gitPolicy": "branch_commit_pr",
    "prPolicy": "draft",
    "allowedBranchPrefix": "agent/"
  }
}

Fase structured result
- POST /api/agent/executions/:id/finalize
  - passa a aceitar resultObject

Campo novo recomendado no payload
- result: z.record(...)

Fase routines
- seguir pattern route fina + service robusto + schemas validadores compartilhados

Git workflow recomendado
Esse ponto precisa ficar muito claro porque ele tem implicação de segurança e UX.

Eu recomendaria formalizar 3 modos de git policy
- no_write
  - runner não escreve no repo
  - só analisa e retorna sugestões
- branch_only
  - runner cria branch local isolada
  - trabalha nela
  - não faz push/PR
- branch_commit_pr
  - runner cria branch
  - faz commit na branch
  - faz push
  - abre PR
  - para em REVIEW/QA_READY

Minha recomendação prática para o FluXo de produto
- default por projeto: branch_commit_pr
- regra de segurança: proibido escrever em default branch/protected branch
- reviewer/qa nunca mergeiam automaticamente no v1

Branch naming template sugerido
- agent/{taskLocalId}-{role}-{slug}
ou
- agent/{projectKey}-{taskLocalId}-{role}

Exemplo
- agent/agq-534-builder

Dados que devem ser persistidos na execution
- baseBranch
- branchName
- prUrl
- prNumber
- commitShas
- gitMode usado

Dados que devem ser refletidos na Task
- githubPrNumber
- githubPrUrl
- githubPrStatus

Estratégia de tokens e contexto
Esse é um ponto central. O FluXo não pode depender de prompt gigante.

Modelo recomendado
- prompt fixo pequeno e estável
- contexto dinâmico pequeno e ranqueado
- retrieval sob demanda para o resto

Envelope fixo do prompt
- role prompt curto
- operating rules curtas
- task title/description
- output contract resumido
- git/runtime policy resumida

Budget sugerido por run
- rolePrompt: 300-600 tokens
- operatingRules: 100-250 tokens
- task payload: 200-600 tokens
- output contract: 150-250 tokens
- dynamic context budget total: 800-1500 tokens max no v1

O que pode consumir budget dinâmico
- 1 ou 2 MemoryEntry relevantes
- 1 ou 2 Microskills relevantes
- 1 doc snippet curto se score forte

O que não deve entrar por default
- transcript antigo completo
- documentação longa
- output de execuções passadas sem score alto
- skill grande e genérica demais

Ranking recomendado para retrieval
1. skill explicitamente bound ao role
2. memory de projeto e execution_summary semelhante
3. incident_fix com alta similaridade
4. doc snippet

Estratégias de controle de custo
- deduplicar contexto por hash dentro da execution
- cap por item e cap total
- resumir candidates antes de injetar
- preferir referência curta + instruções objetivas

Testabilidade e gates por fase
Se a meta é robustez, cada fase precisa ter teste próprio e gate claro.

Fase 1: role/output contract
Testes
- unit do prompt builder
- unit de merge de config/role
- unit de parser/validator de ExecutionResult

Gate
- prompt final não inclui rag bruto por default
- finalize aceita result estruturado e preserva compatibilidade

Fase 2: runtime binding
Testes
- unit de resolução binding por project + hostOs + runnerProfile
- unit de fallback/precedência
- authz test de UI/admin-only

Gate
- nenhuma execution usa path livre vindo da UI comum

Fase 3: git workflow
Testes
- unit de branch naming
- integration de preflight git policy
- integration de branch/PR metadata persistida

Gate
- protected/default branch jamais é usada para escrita direta

Fase 4: memory
Testes
- unit de candidate extraction
- integration de persistência pós-execution
- retrieval ranking test com budget fixo

Gate
- retrieval devolve pouco contexto e útil

Fase 5: microskills
Testes
- unit de candidate merge/update
- integration de runtime injection ephemera
- permission/authz se houver UI admin

Gate
- skill bound entra no runtime sem inflar o prompt base

Fase 6: routines
Testes
- unit de trigger parser
- unit de dispatch fingerprint
- integration de coalescing
- integration de revision snapshot/restore

Gate
- rotina não dispara issue/task duplicada sob concorrência

Rollout técnico recomendado
Eu faria em modo compatibility-first.

Passo 1
- adicionar campos/config novos sem quebrar config atual
- manter Context como legado enquanto rolePrompt entra

Passo 2
- passar runner-go a compor prompt novo
- manter fallback para executions antigas sem resultObject

Passo 3
- adicionar runtime binding e usar apenas quando houver match
- fallback temporário para workdir legado

Passo 4
- ativar git policy por projeto, não globalmente

Passo 5
- ativar memory write primeiro, memory retrieval depois

Passo 6
- ativar microskill draft primeiro, runtime injection depois

Passo 7
- ativar routines por tipos pequenos e idempotentes primeiro

Sequência de implementação que eu faria agora
Se eu fosse tocar a base a partir de hoje, eu faria exatamente nesta sequência:

Slice 1
- role, rolePrompt, operatingRules, output_schema_version em Agent.config
- prompt builder novo no runner-go
- remover instrução default de commit em prompt
- finalize aceitando resultObject v1

Slice 2
- ProjectRuntimeBinding model + repository + admin API
- runnerInstance metadata com hostOs/runnerProfile
- claim-next retornando runtimeBinding resolvido

Slice 3
- git policy v1
- branch name builder
- persistência de branch/baseBranch/prUrl/prNumber em metadata/result
- integração com GitHub PR

Slice 4
- MemoryEntry model + pipeline pós-finalize
- salvar execution_summary e decision candidates

Slice 5
- Microskill model + agent skill bindings
- runtime injection ephemera estilo Paperclip, mas minimalista

Slice 6
- Routine, RoutineTrigger, RoutineRevision, RoutineRun
- dispatch fingerprint + coalescing

Minha recomendação final de arquitetura
Se eu condensar tudo em uma direção objetiva:

O FluXo deve virar um execution runtime para software agents com 4 contratos centrais:
- quem está executando: Agent Role Policy
- onde e como executa: ProjectRuntimeBinding
- o que produziu: ExecutionResult
- o que a organização aprendeu: MemoryEntry + Microskill

E só depois disso routines entram como camada de automação contínua.

Isso preserva o que o FluXo já tem de mais forte hoje
- pickup distribuído
- handoff entre agents
- execution streaming
- visibilidade operacional

e adiciona o que falta para a próxima fase
- role real
- runtime seguro
- git/PR seguro
- knowledge reutilizável
- automação confiável

Se a gente quiser transformar isso no plano de execução real do repo, o próximo passo ideal é quebrar esse desenho em:
- migrations
- contracts de API
- changeset de runner-go
- changeset de UI/admin
- matriz de testes por slice
