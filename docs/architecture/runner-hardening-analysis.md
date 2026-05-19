# Runner Hardening Analysis

Status: draft inicial

## Contexto

Esta analise registra a leitura do fluxo atual do runner apos uma rodada real em que o lifecycle funcionou, mas a entrega final nao foi confiavel.

Resumo direto:

- o runner esta forte em orquestracao
- o processo ainda esta fraco em validacao de evidencia objetiva
- o sistema ainda aceita sucesso textual com pouca ancoragem no estado real do git

O problema principal nao e mais fazer o runner andar. O problema agora e garantir que ele so chame `SUCCESS` quando houver artefato verificavel.

## Leitura Geral

Hoje o sistema esta melhor em `lifecycle` do que em `delivery validation`.

O fluxo de alto nivel esta funcionando:

- `claim-next`
- criacao de execution
- heartbeat
- runtime binding
- worktree por execucao
- finalize
- comentarios
- handoff entre agentes

Mas o criterio de verdade ainda esta desalinhado.

Hoje existem tres fontes de sinal competindo:

1. `executor.Result.Success`
2. o JSON estruturado produzido pelo agente
3. o estado real do git

Para tasks de escrita, a fonte mais confiavel deveria ser a terceira. Hoje ela ainda entra mais como metadata do que como criterio de decisao final.

## O Que Funcionou Bem

### 1. Lifecycle do runner

O `runner-go` esta executando o ciclo operacional esperado.

Arquivos relevantes:

- `runner-go/internal/orchestrator/worker.go`
- `src/app/api/agent/tasks/claim-next/route.ts`
- `src/app/api/agent/executions/[id]/finalize/route.ts`

O fluxo atual cobre:

- claim da task
- abertura da execution
- heartbeats da execution
- comentario de inicio
- execucao do agente
- finalize com status final
- transicao da task
- reassign para o proximo agente

### 2. Infraestrutura de observabilidade basica

O backend ja suporta events de execution.

Arquivos relevantes:

- `runner-go/internal/orchestrator/worker.go`
- `src/app/api/agent/executions/[id]/events/route.ts`
- `src/infra/adapters/prisma/agent-execution-event.repository.ts`

Ou seja: a infraestrutura para stream existe. O problema atual e mais de qualidade do sinal emitido do que ausencia total de suporte.

### 3. Handoff reviewer -> QA_READY

O encadeamento entre agentes funciona. O pipeline ja consegue sair de builder, passar por reviewer e avancar workflow.

Isso e importante porque mostra que o gargalo saiu da camada de orquestracao e foi para a camada de confiabilidade semantica.

## Onde O Fluxo Quebra Hoje

### 1. O builder pode terminar `SUCCESS` sem delta verificavel

Arquivo: `runner-go/internal/orchestrator/worker.go`

Trecho relevante:

- o worker tenta commitar apenas se `result.Success` for `true`
- se nao houver mudancas, `CommitChanges(...)` retorna `""` sem erro
- isso nao derruba a execucao

Arquivo: `runner-go/internal/runner/branch.go`

`CommitChanges()` hoje faz isso:

- checa `git status --porcelain`
- se o worktree estiver limpo, retorna `""` e `nil`

Na pratica isso significa:

- uma execucao de escrita pode terminar como sucesso
- sem diff real
- sem commit novo
- sem falha operacional

Esse e o principal buraco que permitiu o falso positivo.

### 2. O snapshot git pode parecer mais forte do que realmente e

Arquivo: `runner-go/internal/runner/gitsnapshot.go`

`CaptureGitSnapshot()` grava o `HEAD` atual em `commitShas`, mesmo antes de provar que houve commit novo nesta execucao.

Depois ele tenta calcular commits novos a partir do baseline. Mas, se nao houver commit novo, o snapshot ainda pode carregar o `HEAD` herdado.

Isso gera uma forma perigosa de ambiguidade:

- o payload final parece ter metadata git valida
- mas essa metadata nao prova delta produzido pela execucao atual

Esse comportamento explica bem o caso de "resultado bonito e plausivel" desconectado do estado real da branch.

### 3. O fallback estruturado ainda deriva narrativa com pouco sinal objetivo

Arquivo: `runner-go/internal/runner/result.go`

Se o agente nao devolver um bloco final confiavel, o runner constroi um `ExecutionResultV1` derivado.

Esse fallback e util para resiliencia de UX, mas hoje ele nao deve ser usado como prova suficiente de entrega em tasks de escrita.

O risco atual e:

- texto plausivel
- arrays preenchidos
- resumo coerente
- nenhum artefato real correspondente

### 4. O reviewer so reprova quando o proprio agente declara rejeicao

Arquivos relevantes:

- `runner-go/internal/runner/result.go`
- `runner-go/internal/orchestrator/worker.go`

Hoje o worker interpreta review assim:

- se o executor terminou com sucesso, a execucao tende a ir para `SUCCESS`
- o fluxo so muda se o JSON final do reviewer vier com `status = rejected`

Isso significa que o reviewer ainda esta ancorado demais na narrativa que ele mesmo produz.

O runner ainda nao aplica uma regra forte do tipo:

- review nao pode aprovar sem diff verificavel
- review nao pode aprovar sem commit novo ou PR
- review nao pode aprovar quando a evidencia do builder e vazia

### 5. O endpoint de `finalize` e passivo demais

Arquivo: `src/app/api/agent/executions/[id]/finalize/route.ts`

Hoje a rota faz bem a persistencia e a transicao de estado, mas assume boa-fe semantica do runner.

Ela aceita:

- `status`
- `result`
- `resultSummary`
- `nextStatus`
- `nextAssigneeAgentId`

E aplica isso na execution e na task.

Ela ainda nao impone invariantes como:

- builder nao pode finalizar `SUCCESS` sem evidencia git
- reviewer nao pode empurrar para `QA_READY` sem evidencias minimas
- payload git nao pode ser tratado como delta se ele so reflete o `HEAD` herdado

### 6. Os events existem, mas o sinal emitido pelo executor pode ser fraco

Arquivos relevantes:

- `runner-go/internal/executor/executor.go`
- `runner-go/internal/orchestrator/worker.go`

O worker ja faz flush de events para a API.

Mas o `OpenCodeExecutor` hoje basicamente streama linhas cruas de `stdout` e `stderr` do comando `opencode run --format json`.

Se o adapter nao emitir stream incremental de qualidade, a observabilidade fica fraca no meio da run.

Isso explica porque o sistema pode ter heartbeats corretos e mesmo assim pouca visibilidade operacional ate o resultado final.

## Diagnostico Tecnico

O processo esta maduro por fora e imaturo por dentro.

Por fora:

- parece enterprise
- tem leases
- tem runtime binding
- tem heartbeat
- tem comments
- tem structured result
- tem handoff entre agentes

Por dentro:

- ainda confia demais em texto do agente
- ancora pouco a decisao final no git real
- ainda permite `success without artifact`
- ainda deixa o reviewer aprovar sem evidencias fortes

## Direcao Correta De Hardening

### 1. `SUCCESS` de escrita deve exigir evidencia git objetiva

Prioridade: maxima

Regra proposta:

- para agentes escritores com `gitPolicy != no_write`
- `SUCCESS` so e permitido quando houver delta verificavel

Sinais aceitos:

- commit novo em relacao ao baseline
- arquivos alterados de forma verificavel pela execucao
- PR criado a partir de branch com commit novo

Regra pratica minima:

- se nao houver `newCommitShas` e nao houver `changedFiles`, a execucao deve falhar

Mensagem sugerida:

`Execution reported success but produced no verifiable git delta.`

Melhor camada para isso:

- `runner-go/internal/orchestrator/worker.go`

Esse e o guardrail mais importante.

### 2. Separar claramente baseline de delta git

Prioridade: maxima

Hoje `git.commitShas` e ambiguo porque pode carregar apenas o `HEAD` atual.

Estrutura recomendada de metadata:

- `baselineHeadSha`
- `finalHeadSha`
- `newCommitShas`
- `changedFiles`
- `hasVerifiableDelta`

E no resultado final:

- `result.git.commitShas` deve representar apenas commits novos da execucao
- nao o commit herdado do branch/base

Isso reduz drasticamente o risco de falso positivo convincente.

### 3. O reviewer deve ser evidence-driven

Prioridade: maxima

Regra proposta:

- se a task revisada deveria ter alteracao de codigo
- e nao houver commit novo, arquivos alterados ou PR
- o reviewer deve obrigatoriamente rejeitar

Isso pode ser reforcado em duas camadas:

1. prompt/contexto do reviewer
2. validacao runner-side antes do finalize

O ideal e nao depender apenas do modelo perceber isso espontaneamente.

### 4. Adicionar uma segunda barreira na API de `finalize`

Prioridade: alta

Mesmo com o guardrail no worker, a API deveria proteger invariantes semanticas do workflow.

Exemplos:

- recusar `SUCCESS` de builder sem `hasVerifiableDelta`
- recusar `QA_READY` quando o review nao esta ancorado em evidencia minima
- registrar `validationFailureReason` ou `validationWarnings` na execution

Essa camada nao deve substituir a validacao do worker, mas deve servir como linha secundaria de defesa.

### 5. Diferenciar politicas por tipo de agente

Prioridade: alta

Hoje a validacao ainda nao separa bem os comportamentos esperados por tipo de agente.

Politica sugerida:

`builder`

- exige delta git
- exige comentario final com evidencia

`reviewer`

- exige juizo explicito `success` ou `rejected`
- nao pode aprovar sem evidencias do builder

`research` ou execucao `no_write`

- pode ter sucesso textual
- nao exige delta git

Isso evita endurecer demais casos legitimos de leitura, analise ou pesquisa.

### 6. Melhorar comentario final para auditoria humana

Prioridade: media-alta

Hoje comentarios genericos reduzem muito a auditabilidade.

Formato recomendado:

- `Final summary`
- `Evidence`
- `new commits`
- `changed files`
- `pr`
- `checks`
- `outcome rationale`

Se nao houver evidencia, o comentario precisa dizer isso explicitamente.

Exemplo:

`Execution output claimed success, but runner found no verifiable git delta.`

### 7. Emitir events proprios de orquestracao

Prioridade: media

Como o stream do agente pode ser fraco, o worker deveria emitir eventos estruturados proprios para etapas do lifecycle.

Exemplos:

- `claim_succeeded`
- `workspace_prepared`
- `feature_lock_acquired`
- `worktree_created`
- `branch_switched`
- `git_preflight_passed`
- `execution_started`
- `execution_finished`
- `git_commit_attempted`
- `git_commit_created`
- `git_push_succeeded`
- `pr_created`
- `finalize_requested`
- `finalize_completed`

Isso melhora debugging mesmo quando o agent stream e pobre.

### 8. Validar coerencia entre narrativa e git

Prioridade: media

Checks uteis:

- `whatChanged` preenchido com `changedFiles` vazio deve gerar warning
- `status = success` com zero evidencia git em task de escrita deve falhar
- `prUrl` presente com `newCommitShas` vazio deve gerar warning ou falha
- `filesTouched` do agente deve perder para `changedFiles` detectados pelo runner

## Ordem Recomendada De Implementacao

1. falhar execucoes de escrita sem delta git verificavel
2. corrigir `git.commitShas` para representar apenas commits novos
3. enriquecer metadata com baseline, head final e delta explicito
4. endurecer reviewer para rejeitar ausencia de evidencia
5. melhorar comentario final com secao de evidencia
6. emitir events proprios de orquestracao
7. adicionar invariantes defensivos em `/finalize`

## Criterios Objetivos Sugeridos

### Builder com escrita

`SUCCESS` permitido apenas se houver pelo menos um dos sinais abaixo:

- `newCommitShas.length > 0`
- `changedFiles.length > 0` em policy que ainda nao commitou
- `prUrl` apenas quando acompanhado de commit novo verificavel

### Reviewer

`QA_READY` permitido apenas se:

- houver resultado estruturado explicito
- o review declarar `success` ou `rejected`
- existir evidencia analisavel do builder

Sem isso:

- o review deve rejeitar

### Comentario final

O comentario final deve sempre incluir:

- outcome
- evidence
- checks
- next step

## Conclusao

O gargalo atual do runner nao e mais operacional.

O lifecycle esta vivo.

O problema agora e de contrato de confiabilidade:

- impedir `success sem artefato`
- impedir `review sem evidência`
- impedir comentarios finais desconectados do git real

O melhor proximo passo nao e melhorar apenas prompt.

O melhor proximo passo e endurecer a maquina:

- primeiro no worker
- depois no reviewer
- e por fim com uma segunda barreira na API

So assim o sistema para de recompensar narrativa plausivel e passa a recompensar evidencia objetiva.
