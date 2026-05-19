# Runner Enterprise Bootstrap - Spec Detalhada

Status: draft para feature

## Resumo

Transformar o `fluxo-runner init` em um bootstrap enterprise de projeto. O objetivo e que um dev entre em um repo, rode um comando interativo, vincule ou crie o projeto no FluXo, configure integracoes locais com OpenCode e Claude Code, grave configs seguras na maquina, e opcionalmente dispare uma execucao inicial que publique documentacao minima e semeie o projeto para uso imediato na UI.

## Problema

Hoje o runner-go cobre o lifecycle tecnico de claim, execucao e finalize, mas ainda depende demais de configuracao operacional espalhada entre backend e maquina local.

Problemas atuais:

- `repoPath` e `agent.workdir` ainda carregam semantica local demais
- `init` ainda e estreito demais para onboarding real
- nao existe fluxo padrao para integrar OpenCode e Claude Code no setup inicial
- nao existe pipeline de bootstrap do projeto apos o vinculo local
- branch/worktree ainda esta otimizado para task execution, nao para ownership de feature no produto

## Objetivos

- fazer do `fluxo-runner init` a porta de entrada de onboarding tecnico
- separar politica central de configuracao local por projeto
- remover dependencia principal de `project_runtime_bindings.repo_path`
- reduzir ou deprecar `agent.workdir`
- suportar configuracao opt-in de OpenCode e Claude Code
- suportar bootstrap inicial do projeto com docs, tags e configuracoes basicas no FluXo
- deixar o processo auditavel, idempotente e seguro
- permitir implementar a feature end-to-end usando o proprio runner

## Nao Objetivos

- paralelizar multiplas tasks escritoras na mesma feature na primeira versao
- suportar todos os providers e todos os IDEs no primeiro release
- automatizar upload completo de toda a documentacao do repo sem aprovacao do usuario
- resolver todo o design final de UX da UI do FluXo agora

## Personas

### Dev entrando em um repo existente

Quer rodar um comando unico, responder poucas perguntas e comecar a usar FluXo no contexto daquele projeto.

### Admin tecnico / team lead

Quer que o onboarding seja seguro, repetivel e facil de auditar.

### Runner / bootstrap agents

Precisam operar com ownership claro entre configuracao local, politica remota e bootstrap do projeto.

## Experiencia Desejada

Exemplo de fluxo alvo:

1. o dev entra no repo
2. roda `fluxo-runner init`
3. o CLI detecta repo, git root e git common dir
4. o CLI pergunta se deseja vincular o repo atual ao FluXo
5. o CLI pergunta se quer usar projeto existente ou criar novo
6. o CLI pergunta se deseja configurar OpenCode e Claude Code
7. o CLI pergunta se deseja enviar docs minimas e iniciar bootstrap
8. o CLI grava configuracoes locais
9. o CLI valida auth e ferramentas
10. o CLI cria ou dispara uma task/execucao de bootstrap no FluXo
11. o dev abre a UI e encontra o projeto semeado

## Modelo de Configuracao

### 1. Global da maquina

Arquivo:

- `~/.config/fluxo-runner/config.yaml`

Responsavel por:

- auth e api url
- defaults globais da maquina
- preferencias do CLI
- deteccao e estado de ferramentas disponiveis

### 2. Local do repo, nao versionado

Arquivo:

- `$(git rev-parse --git-common-dir)/fluxo-runner/project.yaml`

Responsavel por:

- `projectId`
- `repoPath`
- `provisionCommand`
- `provisionCacheKey`
- integracoes locais instaladas
- metadata de bootstrap local

### 3. Opcional versionado no repo

Arquivo futuro:

- `.fluxo/project.yaml`

Responsavel por:

- defaults compartilhaveis do projeto
- preferencias nao sensiveis de bootstrap
- fontes de docs e pastas relevantes
- preferencias declarativas de skills/integracoes

## Ownership de Campos

### Backend central

- `gitPolicy`
- `defaultBaseBranch`
- `allowedBranchPrefix`
- `executionMode`
- `prPolicy`
- politicas organizacionais e defaults do projeto

### Local do runner

- `repoPath`
- `provisionCommand`
- `provisionCacheKey`
- integracoes instaladas na maquina
- preferencias locais nao compartilhadas

### Regra de merge

Nao deve existir merge cego campo a campo. Deve existir merge por ownership.

- politica remota manda no comportamento do projeto
- config local resolve onde e como aquele repo vive na maquina
- manifesto versionado, se existir, alimenta defaults compartilhaveis mas nao substitui seguranca local

## Fluxo de Bootstrap

### Fase 1. Vinculo local

O CLI detecta o repo atual e grava o `project.yaml` local.

### Fase 2. Integracoes locais

O CLI oferece configurar OpenCode e Claude Code.

Escopo esperado:

- instalar ou atualizar arquivos de configuracao necessarios
- registrar skills internas do FluXo quando fizer sentido
- nao sobrescrever configuracoes do usuario sem confirmacao

### Fase 3. Bootstrap do projeto no FluXo

Com consentimento explicito, o CLI dispara um fluxo inicial no FluXo para:

- criar task de onboarding/bootstrap
- subir docs minimas extraidas do repo
- sugerir ou criar tags iniciais
- sugerir ou registrar skills internas relevantes
- deixar um trilho auditavel para humanos na UI

## Agentes de Bootstrap

### Agent 1. Repo Profiler

Responsabilidade:

- analisar o repo localmente
- ler README, docs principais e manifests tecnicos
- montar um manifesto resumido do projeto
- preparar pacote minimo de docs seguras para upload

Saida esperada:

- resumo do projeto
- stack detectada
- docs candidatas
- tags sugeridas
- skills sugeridas

### Agent 2. Project Bootstrapper

Responsabilidade:

- receber o manifesto do profiler
- criar ou atualizar artefatos no FluXo
- publicar docs
- criar task de onboarding
- anexar comentarios e contexto para humanos

Saida esperada:

- docs publicadas
- task de bootstrap criada ou atualizada
- estado do projeto semeado no FluXo

## Seguranca

Requisitos obrigatorios:

- nunca persistir `repoPath` da maquina no backend como fonte principal
- pedir consentimento antes de qualquer upload de docs
- suportar `.fluxoignore`
- redigir segredos antes de upload
- manter logs auditaveis por agente
- garantir idempotencia do bootstrap
- manter integracoes locais como opt-in

Controles minimos:

- preview da lista de arquivos/docs a serem enviados
- preview das integracoes que serao escritas
- dry-run futuro para setups enterprise mais restritos

## Modelo de Branch e Worktree

### Recomendacao V1

- uma branch remota por feature
- um worktree efemero por execucao
- uma unica execucao escritora por feature por vez

Justificativa:

- simplifica sincronizacao
- reduz conflitos entre tasks sequenciais da mesma feature
- preserva isolamento de filesystem por execucao
- permite um PR unico por feature para a base protegida

### Fluxo detalhado

1. a feature ganha uma branch canonica, por exemplo `agent/feature-<id-curto>-<slug>`
2. o runner sempre busca o HEAD mais recente dessa branch
3. cada task cria um worktree temporario a partir dessa branch
4. a execucao altera, commita e faz push para a mesma branch da feature
5. a task seguinte parte do HEAD atualizado da branch da feature
6. ao fim da feature, abre-se um PR da branch da feature para a branch base

### Regras de sincronizacao

- tasks escritoras da mesma feature nao devem rodar em paralelo na V1
- tarefas puramente de leitura podem rodar em `no_write`
- o runner precisa de um lock de escrita por feature
- o lock deve existir antes da criacao do worktree da execucao

### Evolucao futura

Se precisarmos paralelismo real dentro da mesma feature:

- manter branch principal da feature
- derivar task branches curtas a partir dela
- integrar de volta por uma task integradora controlada

Isso deve ser V2, nao o default inicial.

## Shape da Feature no FluXo

Titulo sugerido da feature:

- `Enterprise project bootstrap via fluxo-runner init`

Descricao curta sugerida:

- transformar o init do runner em um onboarding enterprise com vinculo local por projeto, configuracao opcional de OpenCode/Claude Code, e bootstrap inicial auditavel no FluXo

## Breakdown de Tasks

As tasks abaixo ja estao escritas para caber em execucoes unicas e com handoff claro.

### Task 1. Runner local project config + `init --project`

Objetivo:

- introduzir o arquivo local por projeto em `git-common-dir`
- ensinar o runner a resolver `repoPath` localmente por `projectId`
- adicionar fluxo interativo `init --project`

Entregaveis:

- loader/validator da config local
- merge por ownership entre politica remota e config local
- escrita segura do `project.yaml`

Checks:

- testes de config
- testes de worker para fallback local
- build do `runner-go`

### Task 2. Scaffold de integracoes OpenCode e Claude Code

Objetivo:

- permitir que o `init` ofereca configurar as ferramentas locais

Entregaveis:

- instalacao opt-in de arquivos/configs necessarios
- fluxo de confirmacao antes de sobrescrever qualquer coisa
- validacao basica de funcionamento

Checks:

- dry-run ou testes de geracao de arquivos
- smoke local de integracao

### Task 3. Contrato de bootstrap do projeto no FluXo

Objetivo:

- definir como o `init` pede um bootstrap inicial para o backend/runner

Entregaveis:

- shape do payload de bootstrap
- task de onboarding criada com metadata suficiente
- comentarios auditaveis

Checks:

- teste de rota ou contrato
- exemplo real com projeto de teste

### Task 4. Repo Profiler

Objetivo:

- criar o agente/processo que extrai contexto minimo do repo

Entregaveis:

- leitura de README e docs base
- resumo de stack
- lista de docs candidatas
- sugestao de tags e skills

Checks:

- smoke em repo real
- limite e filtro de escopo para evitar excesso

### Task 5. Docs bootstrap com `.fluxoignore` e redacao

Objetivo:

- enviar docs minimas com seguranca e consentimento

Entregaveis:

- parser de `.fluxoignore`
- filtro de caminhos sensiveis
- redacao basica de segredos comuns
- upload de docs via Agent API

Checks:

- cobertura de filtros
- smoke de upload em projeto real

### Task 6. Feature workspace lock e branch sync

Objetivo:

- garantir sincronizacao correta da branch de feature entre execucoes

Entregaveis:

- lock de escrita por feature
- resolucao de branch canonica por feature
- worktree efemero por execucao usando HEAD atualizado

Checks:

- teste de repeticao sequencial na mesma feature
- teste de bloqueio de concorrencia escritora

### Task 7. E2E bootstrap usando o proprio runner

Objetivo:

- provar a visao completa em um fluxo real

Entregaveis:

- repo vinculado por `init`
- integracao local configurada
- bootstrap task criada
- docs minimas publicadas
- feature/tarefas prontas para continuar implementacao

Checks:

- smoke completo documentado
- evidencias na UI do FluXo

## Dependencias e Ordem Recomendada

1. Task 1
2. Task 6
3. Task 2
4. Task 3
5. Task 4
6. Task 5
7. Task 7

Motivo:

- precisamos primeiro resolver ownership de config e sincronizacao de branch
- depois podemos acoplar integracoes e bootstrap do projeto

## Criterios de Aceite da Feature

- um dev consegue rodar `fluxo-runner init` dentro de um repo e vincular o projeto
- o path local nao precisa ser persistido no backend para o runner operar
- o CLI consegue configurar OpenCode e/ou Claude Code com consentimento
- o CLI consegue disparar bootstrap inicial auditavel
- docs minimas chegam ao FluXo com filtros de seguranca
- a branch da feature permanece sincronizada entre tasks sequenciais
- a feature pode ser implementada end-to-end usando o proprio runner

## Riscos

- sobrescrever config local do usuario sem UX cuidadosa
- upload excessivo ou sensivel de docs
- conflitos de branch se tentarmos paralelizar escrita cedo demais
- mistura indevida entre ownership local e remoto

## Perguntas em Aberto

- quanto da configuracao de OpenCode e Claude Code deve ser gerada automaticamente versus sugerida?
- o bootstrap deve criar projeto novo direto pelo `init` ou apenas vincular a um existente na V1?
- o lock por feature deve ser local, remoto, ou ambos?
- a branch da feature deve nascer por titulo, ID local ou UUID curto?

## Recomendacao Final

Sim, faz sentido usar essa spec para abrir uma feature no FluXo e executar as tasks pelo proprio runner. A recomendacao para a V1 e manter uma branch/worktree logica por feature, com uma execucao escritora por vez, porque isso entrega sincronizacao previsivel sem introduzir o custo de merge paralelo entre tasks antes da hora.
