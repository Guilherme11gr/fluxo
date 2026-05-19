# Runner FluXo vs Paperclip

Status: draft inicial

## Objetivo

Comparar o fluxo atual do runner do FluXo com os mecanismos observados no Paperclip para identificar o que vale copiar, adaptar ou evitar.

## TL;DR

- O Paperclip esta mais forte em `workflow truth`.
- O FluXo ja esta mais forte em `git-aware execution`.
- O Paperclip parece tratar melhor `run ownership`, `review gates` e `successful run missing next step`.
- O FluXo precisa endurecer `artifact truth`: sucesso de escrita so com delta git verificavel.
- A melhor direcao nao e copiar um ou outro inteiro. E combinar o melhor dos dois modelos.

## Referencias Inspecionadas

Paperclip:

- `doc/spec/agent-runs.md`
- `doc/spec/agents-runtime.md`
- `doc/UNTRUSTED-PR-REVIEW.md`
- `tests/e2e/signoff-policy.spec.ts`
- `server/src/services/issues.ts`
- `server/src/services/recovery/successful-run-handoff.ts`
- `server/src/services/heartbeat.ts`

FluXo:

- `runner-go/internal/orchestrator/worker.go`
- `runner-go/internal/runner/branch.go`
- `runner-go/internal/runner/gitsnapshot.go`
- `runner-go/internal/runner/result.go`
- `src/app/api/agent/executions/[id]/finalize/route.ts`
- `src/domain/use-cases/tasks/claim-next-task.ts`

## Leitura Executiva

O Paperclip organiza melhor a verdade do workflow:

- quem pode agir
- em qual stage
- com qual run
- e o que acontece quando uma run termina sem deixar a issue em um estado valido

O FluXo organiza melhor a verdade do repositorio:

- runtime binding
- `gitPolicy`
- branch por feature/task
- worktree por execucao
- feature lock

O problema do FluXo hoje e que a verdade do git ainda nao manda o suficiente na decisao final.

## Comparativo Direto

| Tema | FluXo hoje | Paperclip | Copiar / adaptar / evitar |
| --- | --- | --- | --- |
| Unidade de execucao | `execution` + lease por projeto/task | `heartbeat_runs` + `agent_wakeup_requests` + runtime state | Adaptar: o modelo do Paperclip e mais rico para auditoria |
| Ownership da execucao | feature lock + worktree por execucao | `checkoutRunId` e `executionRunId` travam a issue por run | Copiar: lock explicito por run/issue |
| Wakeup/orquestracao | `claim-next` atomico, polling por agente | wakeup coordinator central com coalescing | Adaptar: manter `claim-next`, mas absorver coalescing e reason tracking |
| Review gate | reviewer decide via output estruturado | signoff policy explicita com reviewer/approver autorizados | Copiar: stage gates explicitos |
| Sucesso sem proximo passo | ainda pode acontecer | watchdog detecta `successful run missing disposition` e enfileira recovery | Copiar: esse padrao fecha um buraco real |
| Verdade do git | existe snapshot, branch e commit workflow, mas sem hard gate suficiente | nao parece ser a fonte principal de verdade | Evitar copiar cegamente: aqui o FluXo precisa ser mais duro que o Paperclip |
| Observabilidade | heartbeats, comments, events basicos | full logs, excerpts, run events, live updates fortes | Copiar: principalmente logs completos + excerpts + events de sistema |
| Comentario final | ainda pode ficar generico | system notices estruturadas com metadados e acao requerida | Copiar: melhora muito auditoria humana |
| Isolamento para review | nao ha fluxo formalizado | review hostil em Docker/worktree separado | Adaptar: util para PR review nao confiavel |
| Resume/contexto | previous execution + retrieved memory | session state por `(agent, taskKey, adapterType)` | Adaptar: a ideia e boa, sem necessariamente copiar o modelo inteiro |

## O Que O Paperclip Faz Melhor

### 1. Lock de ownership por run

O Paperclip nao deixa qualquer execucao mexer numa issue de qualquer jeito.

Em `server/src/services/issues.ts`, `checkoutRunId` e `executionRunId` funcionam como trava operacional. Isso faz duas coisas muito bem:

- impede concorrencia sem dono claro
- impede mutacao por run errada

No FluXo, temos lock por feature e isolamento por worktree, o que e bom para git. Mas ainda vale adicionar um ownership lock semantico mais explicito na task/execution.

### 2. Review e approval como gate de workflow real

Em `tests/e2e/signoff-policy.spec.ts`, o executor nao "ganha" review por narrativa. O workflow define:

- quem revisa
- quem aprova
- quem pode avancar stage
- quem pode pedir changes

No FluXo, o reviewer ainda esta mais perto de um agente de interpretacao do que de um gate formal de signoff.

### 3. Recovery para "run bem-sucedida sem disposicao valida"

Esse e o padrao mais interessante do Paperclip para o nosso problema.

Em `server/src/services/recovery/successful-run-handoff.ts`, se uma run termina `succeeded` mas a issue continua sem uma saida valida, o sistema:

- detecta a inconsistencia
- deixa notice sistemico
- enfileira uma wake corretiva

E o mais importante: o proprio texto deles deixa claro que comentario e resumo nao bastam. A issue precisa terminar com um caminho valido de workflow.

Isso conversa diretamente com o nosso problema de `success sem entrega real`.

### 4. Observabilidade rica como parte do runtime

Em `server/src/services/heartbeat.ts`, eles persistem:

- `logStore`
- `logRef`
- `stdout_excerpt`
- `stderr_excerpt`
- run events leves
- live log push

No FluXo, a infraestrutura de events existe, mas o valor diagnostico ainda esta abaixo disso.

### 5. Review nao confiavel em ambiente isolado

Em `doc/UNTRUSTED-PR-REVIEW.md`, o Paperclip formaliza um fluxo de review hostil em Docker com clone/worktree proprio.

Para qualquer review de PR de terceiros ou codigo sensivel, isso e muito melhor do que rodar em checkout compartilhado da maquina host.

## O Que O FluXo Ja Faz Melhor

### 1. Git-aware execution e mais forte

O FluXo ja tem varios blocos certos para um runner de escrita:

- runtime binding por projeto
- `gitPolicy`
- base branch e prefixo permitidos
- branch canonica por feature
- worktree por execucao
- feature lock

Esses blocos nao apareceram com a mesma forca no Paperclip que foi inspecionado.

### 2. Claim atomico focado em task execution

O `claim-next` do FluXo ja entrega junto:

- task
- execution
- lease
- runtime binding
- previous execution
- retrieved memory

Esse contrato e bastante bom para o tipo de automacao que estamos fazendo.

### 3. Resultado estruturado final e mais especifico para coding loop

O FluXo ja pede um bloco final fortemente estruturado com `summary`, `whatChanged`, `checksRun`, `filesTouched`, `git`, `followups`.

O problema nao e falta de schema.

O problema e falta de enforcement contra a realidade do git.

## O Que Vale Copiar Quase Sem Mudanca

### 1. Watchdog de `successful run missing disposition`

Mesmo depois de endurecer git truth, ainda vamos precisar de uma regra tipo:

- se a execucao terminou bem, mas a task ficou sem destino valido, o sistema corrige ou bloqueia automaticamente

Esse padrao vale copiar.

### 2. System notice estruturado com acao requerida

Comentarios finais deveriam ter formato mais proximo de notice operacional do que texto generico.

Isso vale copiar.

### 3. Signoff policy explicita

Para reviewer e approval, um gate formal com participante autorizado e melhor do que um reviewer solto aprovando por texto.

Isso vale copiar.

### 4. Logs completos + excerpts + events de sistema

Esse padrao vale copiar quase inteiro.

## O Que Vale Adaptar

### 1. Wakeup coordinator

O Paperclip usa wakeup coordinator DB-backed com coalescing.

No FluXo, eu nao substituiria o `claim-next` por isso. Mas valeria adaptar:

- `wakeReason`
- `idempotency`
- `coalescedCount`
- historico mais claro de porque aquela execucao aconteceu

### 2. Session state por task

O Paperclip trata resume por `(agent, taskKey, adapterType)`.

No FluXo, isso pode virar uma camada mais forte sobre:

- previous execution
- branch/HEAD baseline
- recovery context

Vale adaptar, nao copiar literalmente.

### 3. Review isolado

Para o nosso caso, nao precisa ser o mesmo Docker flow do Paperclip no primeiro passo.

Mas vale adaptar para:

- reviewer em worktree isolado
- opcionalmente container para PR review nao confiavel

## O Que Evitar Copiar Cegamente

### 1. Nao trocar verdade de git por verdade de workflow

Esse e o risco principal.

O Paperclip e mais forte em workflow, mas o nosso problema atual exige uma camada extra:

- `builder SUCCESS` precisa depender de delta git verificavel

Isso o FluXo precisa fazer melhor do que o Paperclip.

### 2. Nao importar um subsistema maior que o problema atual

O Paperclip tem um runtime mais amplo: wakeups, adapter registry, runtime state, log store, websocket hub.

Tudo isso faz sentido no produto deles. Mas nao precisamos copiar toda a arquitetura antes de fechar o bug central de falso sucesso.

### 3. Nao confundir comment/recovery com prova de entrega

System notice ajuda muito, mas notice nao substitui artifact validation.

## Modelo Alvo Recomendado Para O FluXo

O melhor desenho parece ser um modelo de duas verdades obrigatorias.

### 1. Workflow truth

A task precisa terminar com um caminho valido:

- `DONE`
- `QA_READY`
- `REVIEW`
- `BLOCKED`
- ou continuacao explicita

### 2. Git truth

Para tasks de escrita, a execucao precisa provar entrega:

- `newCommitShas`
- `changedFiles`
- `baselineHeadSha`
- `finalHeadSha`
- `hasVerifiableDelta`

### Regra final

Para builder com escrita:

- sem workflow truth: nao finaliza corretamente
- sem git truth: nao pode chamar `SUCCESS`

Para reviewer:

- sem workflow truth: nao promove stage
- sem evidence reviewable: deve rejeitar

Para `no_write` ou research:

- workflow truth basta
- git truth nao e obrigatoria

## Backlog Recomendado A Partir Da Comparacao

1. Falhar execucao de escrita sem delta git verificavel.
2. Separar baseline git de commits novos no metadata final.
3. Adicionar `hasVerifiableDelta` como campo explicito de evidencia.
4. Introduzir watchdog de `successful run missing disposition`.
5. Melhorar comentario final para notice estruturado com evidence section.
6. Endurecer reviewer para nao aprovar sem evidencia revisavel.
7. Adicionar lock semantico mais explicito de execution ownership na task.
8. Melhorar logs completos, excerpts e events de sistema.
9. Avaliar review isolado para PR nao confiavel.

## Conclusao

O Paperclip faz melhor a parte de:

- ownership
- signoff
- recovery de workflow
- auditoria operacional

O FluXo ja tem melhores fundamentos para:

- execucao orientada a git
- branch/worktree policy
- task claim atomico

A melhor estrategia para o FluXo nao e virar Paperclip.

E absorver os melhores mecanismos de:

- `workflow guardrails`
- `handoff recovery`
- `run ownership`
- `observability`

sem abrir mao do que precisa ser nossa vantagem principal:

- `artifact truth` como criterio obrigatorio de sucesso em tasks de escrita.


Leitura
O Hermes Kanban é basicamente um board durável local, SQLite-backed, onde o board é a fonte de verdade e cada worker é um processo do SO com identidade própria.
Refs: website/docs/user-guide/features/kanban.md:11, website/docs/user-guide/features/kanban-worker-lanes.md:15
O desenho deles é:
1.
Task board durável.
2.
Dispatcher que promove, claima, reaproveita e reclaima.
3.
Worker que só pode terminar uma run por ferramentas explícitas do kernel.
4.
Histórico por tentativa (task_runs) separado do estado da task.
5.
Comentários e metadata como canal de handoff entre agentes.
O Que O Hermes Faz Muito Bem
1.
O kernel é dono da verdade do lifecycle.
No Hermes, a run não “termina” só porque o processo saiu com 0. O worker precisa terminar explicitamente com kanban_complete(...) ou kanban_block(...). Se sair limpo sem chamar nenhum dos dois, isso é tratado como protocol violation, e eles tripam o breaker na primeira ocorrência.
Refs: website/docs/user-guide/features/kanban-worker-lanes.md:49, hermes_cli/kanban_db.py:3305
2.
Existe ownership forte por run.
Cada task tem current_run_id, e as tools de término passam expected_run_id. Isso impede worker velho ou superseded de fechar a task errada.
Refs: tools/kanban_tools.py:399, website/docs/user-guide/features/kanban-worker-lanes.md:105
3.
Tentativa é first-class.
Eles separam bem task de run. Cada tentativa vira uma linha em task_runs, com outcome, summary, metadata, erro e log. Isso é ótimo para retry, review e auditoria.
Refs: website/docs/user-guide/features/kanban.md:701
4.
Handoff estruturado fica na run, não só na narrativa final.
O kanban_complete(summary, metadata) grava o closeout da tentativa. Tarefas filhas e retries leem esse handoff estruturalmente.
Refs: website/docs/user-guide/features/kanban.md:707, website/docs/user-guide/features/kanban-tutorial.md:283
5.
Heartbeat faz duas coisas.
Não é só “estou vivo”. Ele também estende a claim TTL antes de registrar o evento, evitando reclaim indevido em operação longa.
Refs: tools/kanban_tools.py:473
6.
Circuit breaker e diagnósticos são bem melhores.
Eles distinguem spawn_failed, crashed, timed_out, reclaimed, gave_up e ainda têm regras diagnósticas para padrões ruins.
Refs: hermes_cli/kanban_db.py:3420, hermes_cli/kanban_diagnostics.py:233
7.
Eles já têm um gate anti-alucinação interessante.
Se o worker declara created_cards que não existem ou não foram criados por ele, o kanban_complete é bloqueado e a task continua em voo.
Refs: tools/kanban_tools.py:405, skills/devops/kanban-worker/SKILL.md:102
O Que Isso Significa Em Termos De Filosofia
Hermes trata o worker como executor de um protocolo do board.
Não é:
-
“o agente disse que terminou, então terminou”
É mais:
-
“a task só termina quando o kernel recebe uma transição válida da run dona dela”
Esse ponto é forte e conversa direto com o nosso problema.
Onde O Hermes É Mais Fraco Para O Nosso Caso
1.
Review é convenção, não enforcement duro.
Eles sugerem o padrão review-required: no kanban_block(...), com metadata em comentário, e o reviewer depois comenta/unblock. É bom, mas o kernel não impõe isso de forma forte.
Refs: website/docs/user-guide/features/kanban-worker-lanes.md:59, skills/devops/kanban-worker/SKILL.md:50
2.
Git evidence não é verdade canônica.
Eles recomendam metadata como changed_files, tests_run, diff_path, pr_url, mas isso é convenção de handoff. O kernel não valida git real.
Refs: website/docs/user-guide/features/kanban.md:297, skills/devops/kanban-worker/SKILL.md:37
3.
O sistema é assumidamente single-host/local.
Board em SQLite, dispatcher local, PID local, reclaim local. Isso é ótimo para o produto deles, mas não é nosso modelo principal de control plane.
Refs: website/docs/user-guide/features/kanban.md:11, hermes_cli/kanban_db.py:3300
Comparando Os Três
-
Hermes: melhor em worker protocol correctness
-
Paperclip: melhor em workflow signoff + recovery
-
FluXo: melhor base para git-aware execution
Hoje o melhor desenho para nós parece ser:
-
pegar do Hermes:
-
protocol-driven completion
-
expected_run_id / ownership de execução
-
attempt history first-class
-
circuit breaker
-
diagnostics
-
pegar do Paperclip:
-
signoff policy explícita
-
recovery de successful run missing disposition
-
notices estruturados
-
manter e endurecer no FluXo:
-
git truth obrigatória para tasks de escrita
O Que Eu Copiaria Do Hermes Para O FluXo
1.
Falha dura quando o worker “termina bem” sem transição terminal explícita.
Equivalente nosso:
-
execução não pode virar SUCCESS só por exit code 0
-
precisa passar por validação final explícita do runner
2.
expectedExecutionId em tudo que muta lifecycle.
Equivalente do expected_run_id deles:
-
heartbeat
-
finalize
-
comment final
-
qualquer patch de estado
3.
Histórico por tentativa mais explícito.
Temos execution, mas vale tratar isso ainda mais como tentativa first-class para retry/review/auditoria.
4.
Circuit breaker por falhas consecutivas.
Depois de N runs ruins, a task vai para bloqueio automático em vez de thrash.
5.
Diagnostics de inconsistência operacional.
Exemplos úteis:
-
stale execution
-
repeated failures
-
evidence missing
-
phantom references
-
review-required sem reviewer path
6.
Heartbeat que renova lease antes de logar liveness.
Esse detalhe deles é bom.
O Que Eu Não Copiaria Como Está
1.
review-required só como convenção textual.
No FluXo eu prefiro stage explícito REVIEW com assignee reviewer.
2.
Metadata de handoff sem validação contra git.
Isso reproduziria exatamente nosso problema atual.
3.
Dependência em board local SQLite como fonte principal.
Nosso caso pede backend/API central como verdade.
Minha leitura final
O Hermes não resolve o nosso problema principal de success sem artefato, mas resolve muito melhor um problema anterior:
-
worker saiu, mas o kernel nao recebeu uma transicao valida
Essa camada está mais madura que a nossa hoje.
Então a síntese fica assim:
-
Paperclip ensina workflow recovery
-
Hermes ensina worker protocol enforcement
-
FluXo precisa adicionar artifact enforcement
Se quiser, eu posso transformar isso agora em mais um doc, por exemplo:
docs/architecture/runner-fluxo-vs-hermes.md


Achados
1.
Alto - docs/architecture/runner-fluxo-vs-paperclip.md:247-286
O modelo alvo ainda está incompleto. O texto fala bem de ownership por run (:61-68, :74-84), mas isso some no desenho final. Para o fluxo ficar estável, não basta workflow truth + git truth; falta execution/protocol truth: só a execução dona da task pode heartbeat, finalize, comentar e mover stage. Sem expectedExecutionId/currentExecutionId, uma run velha ainda pode fechar o fluxo “corretamente” no papel.
2.
Alto - docs/architecture/runner-fluxo-vs-paperclip.md:261-277
git truth ainda está ambígua sobre o que autoriza SUCCESS. Se changedFiles continuar contando como prova terminal, o bug atual fecha só pela metade. Para task de escrita, o critério estável precisa ser artefato durável: baselineHeadSha, finalHeadSha, newCommitShas e hasVerifiableDelta=true. changedFiles é bom para diagnóstico/pre-commit, não para sucesso final.
3.
Medio-alto - docs/architecture/runner-fluxo-vs-paperclip.md:167-189 e :288-297
O doc puxa watchdog, notices e signoff cedo demais, mas deixa pouco explícita a camada preventiva no kernel/API. Eu inverteria a ordem: primeiro invariantes no worker e em /finalize, depois ownership, depois reviewer gate, e só então recovery/watchdog. Recovery ajuda depois do erro; o que fecha o falso sucesso é validação antes da persistência.
4.
Medio - docs/architecture/runner-fluxo-vs-paperclip.md:251-259
Você define estados válidos, mas não define uma matriz de transição por papel. O ganho do Paperclip não é só “ter gates”, é “quem pode mover o quê”. Vale formalizar algo como:
-
builder: pode BLOCKED ou pedir review, nunca auto-promover sem evidência.
-
reviewer: aprova/rejeita, mas não inventa evidência.
-
system/recovery: corrige inconsistência, não substitui entrega.
5.
Medio - docs/architecture/runner-fluxo-vs-paperclip.md:300-490
O arquivo deixa de ser “FluXo vs Paperclip” e vira um comparativo híbrido com Hermes. O conteúdo é bom, mas hoje mistura duas contribuições diferentes:
-
Paperclip: workflow recovery, signoff, notices
-
Hermes: protocol enforcement, expected_run_id, circuit breaker
Eu separaria isso em runner-fluxo-vs-hermes.md e deixaria este doc terminar em :327.
Caminho Mais Estavel
1.
Protocol truth
Só a execução atual pode mutar lifecycle.
exit code 0 nunca basta.
Toda conclusão precisa passar por uma transição terminal explícita e validada.
2.
Artifact truth
Para write, SUCCESS final só com evidência git durável.
changedFiles sozinho não fecha a run.
3.
Workflow truth
Matriz explícita de transições por papel.
signoff e reviewer viram regra de máquina, não convenção.
4.
Recovery + observability
successful run missing disposition
notices estruturados
diagnostics
circuit breaker
events mais ricos
Ordem Que Eu Seguiria
1.
Endurecer worker e /finalize.
2.
Introduzir expectedExecutionId/currentExecutionId.
3.
Fechar o contrato de evidência git.
4.
Endurecer reviewer em cima dessa evidência.
5.
Adicionar watchdog/recovery.
6.
Depois melhorar observabilidade e review isolado.
Sintese
A direção do doc está boa, mas eu refinaria o modelo de “duas verdades” para “três verdades obrigatórias”:
-
protocol truth
-
artifact truth
-
workflow truth
Isso deixa o desenho mais estável que Paperclip puro, mais rigoroso que Hermes em git, e mais aderente ao problema real do FluXo.