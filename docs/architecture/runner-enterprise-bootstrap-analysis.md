# Runner Enterprise Bootstrap - Analise Inicial

Status: draft inicial

## Contexto

O runner-go hoje ainda mistura politica central de execucao com detalhes locais da maquina. Isso funciona para smoke e uso tecnico interno, mas nao escala bem para um onboarding enterprise onde um dev deve conseguir entrar em um repo, rodar um unico `fluxo-runner init`, e sair com o projeto pronto para uso no FluXo, OpenCode e Claude Code.

## Leitura Atual

- `repoPath` e `agent.workdir` sao dados locais demais para viverem como fonte principal no backend.
- `gitPolicy`, `defaultBaseBranch`, `allowedBranchPrefix`, `executionMode` e `prPolicy` fazem sentido como politica central do projeto.
- O ponto tecnico certo para resolver isso e no claim da task: o backend entrega a politica do projeto, e o runner resolve localmente onde aquele projeto mora na maquina.
- O `init` atual cria so o `config.yaml` de conexao. Para a visao enterprise, ele deve virar um bootstrap do projeto.

## Direcao Proposta

### 1. Separar ownership de configuracao

Backend central:

- politica git do projeto
- branch base padrao
- prefixos permitidos
- politica de PR
- modo de execucao
- defaults de bootstrap do projeto

Config local por projeto:

- `repoPath`
- `provisionCommand`
- `provisionCacheKey`
- estado local de integracoes e ferramentas
- preferencias locais que nao devem sair da maquina

### 2. Mudar o papel do `init`

`fluxo-runner init` deve ser a porta principal de onboarding.

Fluxo desejado:

1. detectar o repo atual
2. perguntar se o path atual deve ser vinculado a um projeto FluXo
3. permitir escolher projeto existente ou criar um novo
4. configurar runner local
5. opcionalmente configurar OpenCode e Claude Code
6. opcionalmente subir docs minimas e disparar um bootstrap no FluXo

### 3. Adotar config local segura e simples

Diretorio recomendado para a configuracao local do projeto:

`$(git rev-parse --git-common-dir)/fluxo-runner/`

Motivos:

- fica fora do versionamento
- continua compartilhado entre worktrees do mesmo repo
- evita salvar paths locais no backend
- se comporta de forma mais previsivel do que um arquivo global em `~/.config` para clones diferentes do mesmo projeto

### 4. Pensar o bootstrap como produto, nao so como config

No alvo enterprise, o `init` nao deve apenas gravar arquivos. Ele deve deixar o projeto usavel no FluXo.

Exemplo de saida desejada depois do `init`:

- projeto vinculado
- integracoes locais configuradas
- docs minimas enviadas com consentimento do usuario
- tags iniciais sugeridas
- skills internas recomendadas
- task de onboarding criada
- execucao de bootstrap iniciada e auditavel na UI

## Proposta de Arquivos

Global da maquina:

- `~/.config/fluxo-runner/config.yaml`

Local do repo, nao versionado:

- `$(git rev-parse --git-common-dir)/fluxo-runner/project.yaml`

Opcional no futuro, versionado e compartilhavel:

- `.fluxo/project.yaml`

## Seguranca

O fluxo enterprise precisa nascer com regras claras:

- nunca subir `repoPath` local para o backend
- pedir consentimento explicito antes de enviar docs
- suportar `.fluxoignore` para excluir conteudo sensivel
- aplicar redacao basica de segredos antes de upload
- manter bootstrap idempotente
- deixar integracoes com OpenCode e Claude Code sempre opt-in

## Branches e Worktrees

Para a primeira versao, a estrategia mais segura e simples parece ser:

- uma branch canonica por feature
- um worktree efemero por execucao
- apenas uma execucao escritora por feature por vez

Isso permite:

- manter o historico da feature sincronizado
- evitar conflito de multiplas tasks escrevendo na mesma base ao mesmo tempo
- continuar usando isolamento por worktree para cada execucao

Modelo inicial sugerido:

1. a primeira task da feature cria ou reutiliza a branch da feature
2. cada execucao cria um worktree temporario a partir da branch atual da feature
3. a execucao aplica mudancas, commita e faz push de volta para a mesma branch da feature
4. a task seguinte parte do HEAD atualizado da branch da feature
5. o PR final da feature abre da branch da feature para a base protegida

No futuro, se precisarmos paralelismo dentro da mesma feature, podemos evoluir para task branches derivadas da branch da feature, com uma task integradora fazendo merge/rebase controlado. Mas isso nao deve ser o default inicial.

## Conclusao

A direcao correta nao e apenas mover `repoPath` para um arquivo local. O passo certo e transformar o runner em um bootstrapper de projeto enterprise, onde configuracao local, politica central e onboarding automatizado trabalham juntos.
