# Runner Timeout Context

## Objetivo

Diagnosticar e corrigir por que o `fluxo-runner-go` em producao estava morrendo no meio da execucao, especialmente em torno de `300s`, e melhorar o reporting final para que timeout, erro e output ficassem legiveis e corretos.

## Escopo decidido

- Focar em `Agent API` de producao + `runner-go`
- Nao focar em UI local
- Nao fazer migration de banco
- Nao fazer commit automatico
- Manter output machine-readable, mas com versao final legivel para humanos
- Continuar usando o projeto `FLXO`

## Diagnostico confirmado

- Havia timeout hard de `300s` no runner
- O timeout vinha do config do agent e era aplicado no executor
- Quando o processo morria por timeout, a execucao era finalizada como falha generica
- `errorMessage` e `resultSummary` podiam acabar usando uma frase intermediaria do agent, nao a causa real
- O `output` final persistido estava indo cru em JSONL, ruim para leitura humana

## Mudancas anteriores ja feitas antes desta sessao

Ja estavam implementados localmente:

- `role`, `role_prompt`, `operating_rules`, `output_schema_version`
- `ExecutionResult v1`
- `ProjectRuntimeBinding`
- `metadata.runtimeBinding`
- `metadata.git` inicial no `claim-next`
- continuidade por task com `previousExecution`
- reaper de stale/orphan no startup e no loop
- requeue de stale voltando task para `TODO` sem `blocked=true`

Arquivos principais dessas mudancas:

- `runner-go/internal/orchestrator/orchestrator.go`
- `runner-go/internal/orchestrator/worker.go`
- `runner-go/internal/api/claims.go`
- `runner-go/internal/runner/prompt.go`
- `runner-go/internal/runner/output.go`
- `src/domain/use-cases/tasks/claim-next-task.ts`
- `src/infra/adapters/prisma/agent-execution.repository.ts`
- `src/app/api/agent/executions/reap-stale/route.ts`

## O que foi feito nesta sessao

### 1. Timeout/cancelamento no executor

Arquivo:

- `runner-go/internal/executor/executor.go`

Mudancas:

- adicionados flags `TimedOut` e `Canceled` no `executor.Result`
- o executor deixou de depender de `exec.CommandContext(...)` para classificar timeout/cancelamento
- agora ele faz wait explicito do processo e mata o processo quando o contexto realmente expira/cancela
- isso evita mascarar um exit code real como `124` ou `130`

### 2. Reporting final da execucao

Arquivo:

- `runner-go/internal/orchestrator/worker.go`

Mudancas:

- falhas agora ganham headline explicita, por exemplo:
  - `Execution timed out after 5m 0s.`
  - `Execution was canceled before completion.`
  - `Execution failed with exit code X.`
- `errorMessage` e `blockReason` agora refletem a causa real da falha
- `output` final persistido passou a usar stream formatado/legivel em vez de JSONL cru
- `metadata.execution` agora inclui:
  - `timeoutSeconds`
  - `timedOut`
  - `canceled`

### 3. Preservacao do resultado estruturado em falhas

Problema encontrado no review independente:

- na primeira versao do patch, uma falha podia perder o bloco estruturado `ExecutionResultV1`

Correcao aplicada:

- o `structuredOutput` agora preserva o bloco estruturado se o agent o tiver emitido
- isso mantem `summary`/`result` parseaveis mesmo em execucoes que falham

## Review independente

Foi feito review com subagente.

Problemas reais encontrados e corrigidos:

- perda do bloco estruturado em execucoes com falha
- risco de timeout/cancelamento mascarar um exit code real

Depois disso, o review nao apontou mais problema material de implementacao.

## Testes adicionados

### Executor

Arquivo:

- `runner-go/internal/executor/executor_test.go`

Cobre:

- timeout
- cancelamento
- preservacao do exit code real do processo

### Orchestrator

Arquivo:

- `runner-go/internal/orchestrator/worker_test.go`

Cobre:

- headline/mensagem de timeout
- headline/mensagem de cancelamento
- preservacao de `ExecutionResultV1` em falha
- output persistido em formato legivel

## Validacao executada

Comando rodado:

```bash
go test ./internal/executor ./internal/orchestrator ./internal/runner
```

Resultado:

- tudo verde

## Arquivos alterados nesta sessao

- `runner-go/internal/executor/executor.go`
- `runner-go/internal/executor/executor_test.go`
- `runner-go/internal/orchestrator/worker.go`
- `runner-go/internal/orchestrator/worker_test.go`

## Estado atual

O codigo local ficou pronto para:

- distinguir timeout, cancelamento e falha normal
- persistir output final legivel
- gerar `errorMessage`/`resultSummary` mais coerentes
- preservar resultado estruturado em falhas

## O que ainda falta

Nenhum deploy foi validado por mim nesta sessao.

Ainda falta em producao:

- confirmar que o binario novo foi rebuildado/reiniciado
- confirmar que o timeout do agent saiu de `300` para algo mais realista, como `900` ou `1200`
- validar uma execucao real em producao

## Como retomar em outra sessao

Pedir para o agente novo:

1. validar em producao a execucao mais recente do `fluxo-runner-go` no projeto `FLXO`
2. verificar se ainda existe morte em `300s`
3. inspecionar `errorMessage`, `resultSummary`, `output` e `metadata.execution`
4. confirmar se o output final ficou legivel e se timeout/cancelamento aparecem com causa correta

## Referencias uteis

- `runner-go/internal/config/config.go`
- `runner-go/internal/sync/sync.go`
- `runner-go/internal/executor/executor.go`
- `runner-go/internal/orchestrator/worker.go`
- `runner-go/internal/runner/output.go`
- `runner-go/internal/runner/result.go`
- `src/app/api/agent/executions/[id]/route.ts`
- `src/app/api/agent/executions/route.ts`
- `src/app/api/agent/executions/reap-stale/route.ts`
- `src/domain/use-cases/tasks/claim-next-task.ts`
- `src/infra/adapters/prisma/agent-execution.repository.ts`
