# Governanca De Documentacao

## Politica

- repo (`AGENTS.md`, `README.md`, `docs/`, `.github/instructions/`) guarda engenharia, arquitetura implementada, convencoes de codigo, operacao do repo e guias tecnicos
- FluXo guarda contexto de produto, specs funcionais, decisoes de negocio, estudos, investigacoes e memoria de projeto
- quando um doc mistura os dois mundos, a prioridade e separar em vez de manter um documento hibrido

## O Que Fica No Repo

- stack real, estrutura do codigo e limites de camada
- workflow implementado no schema e nas rotas
- convencoes obrigatorias de codigo, auth, datas, cache, UI e verificacao
- instrucoes de agente e de contribuicao para quem altera o codigo

## O Que Fica No FluXo

- problema de negocio e objetivo do trabalho
- escopo funcional, requisitos, regras de produto e criterios de aceite
- estudos, pesquisas, auditorias e comparativos que explicam decisoes
- memoria de projeto que precisa ser recuperada por agentes via docs search

## Classificacao Do Repo

### Manter No Repo

- `AGENTS.md`
- `README.md`
- `.github/instructions/copilot-instructions.md`
- `docs/README.md`
- `docs/architecture/overview.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/workflows.md`
- `docs/guides/date-handling.md`
- `docs/guides/cache-invalidation-patterns.md`
- `docs/ui-ux/standards.md`

Motivo: todos esses arquivos descrevem a realidade tecnica do codigo, operacao do repo ou convencoes de implementacao.

### Ajustes Recomendados No Repo

- `AGENTS.md`: normalizar nomenclatura e reduzir referencias a nomes legados quando nao forem necessarias para contexto historico
- `README.md`: apontar explicitamente para esta politica para evitar que novas docs de produto voltem para o repo
- `docs/README.md`: manter como indice curto e apontar para esta classificacao

## Classificacao Inicial Dos Docs Do FluXo

As recomendacoes abaixo consolidam a politica alvo com o inventario ja levantado. Os tres primeiros itens foram inspecionados diretamente; os demais foram classificados pelo papel sugerido no titulo e devem ser confirmados no conteudo antes de mover ou apagar.

### Reescrever Ou Deprecar No FluXo

- `f11edd5d-108c-4848-b6fe-b8740a71df15` - `Guia do MCP Server para AI Agents`

Motivo: descreve a surface legada de MCP/tools, enquanto o fluxo atual usa Agent API e runner-go. Nao deve seguir como doc canonico.

Acao sugerida:

- marcar como legado/deprecado
- substituir por doc novo focado em Agent API e skills atuais, se ainda houver necessidade de onboarding de agentes no FluXo

### Mover Para Repo Ou Reescrever Como ADR Tecnico

- `6b6378e5-7a14-43a1-884e-07855ee66aa9` - `Arquitetura & Estado Atual do Projeto`
- `09dbbb4d-59e7-46e5-a72c-4531e955ee84` - `Plano: RAG Semantico com pg_vector`
- `aea26ff7-0971-4c80-951d-3ac3ddbaab2a` - `Postgres Best Practices - Guia Completo`
- `a4e34468-c8e9-46b1-9e5e-3db63e6545a3` - `[RT] Arquitetura Enterprise-Grade`

Motivo: sao docs de arquitetura, plataforma, banco ou plano tecnico. Isso pertence ao repo como arquitetura, ADR ou guia tecnico, nao como memoria funcional do FluXo.

Acao sugerida:

- se ainda forem validos, migrar o conteudo util para `docs/architecture/` ou `docs/guides/`
- se estiverem stale, extrair apenas as decisoes ainda verdadeiras e descartar o resto

### Manter No FluXo Como Estudo Ou Investigacao

- `006c0c5a-084d-464b-9a93-69866aeabfa1` - `[RT] Primeira Analise - Estrategia`
- `c8cc8f47-0b82-438a-b2ed-6d514ddfe427` - `[RT] Auditoria de Compatibilidade`

Motivo: parecem registros de pesquisa, estrategia e auditoria. Esse tipo de memoria e util no FluXo desde que esteja vinculada a decisoes de produto, projeto ou discovery.

Acao sugerida:

- manter no FluXo se explicarem contexto de decisao
- adicionar tags de estudo, auditoria ou descoberta para facilitar RAG
- deprecar apenas se forem investigacoes superadas sem valor historico

### Confirmar Conteudo Antes De Decidir

- `b1357bd2-930b-4d95-8b6e-b29a33fe2c39` - `Teste de Integracao API - Atualizado`

Hipotese:

- se for procedimento tecnico de validacao da API, mover para repo ou reduzir a um guia de engenharia
- se registrar resultado de homologacao de uma iniciativa especifica, pode ficar no FluXo como evidencia de projeto

## Regras Praticas Para Proximos Docs

- se o leitor principal e quem vai mudar codigo, o doc provavelmente pertence ao repo
- se o leitor principal e quem vai entender escopo, decisao, tradeoff ou contexto do projeto, o doc provavelmente pertence ao FluXo
- nao criar no FluXo um guia tecnico que ja esteja melhor representado por codigo, teste ou doc de arquitetura do repo
- nao criar no repo memoria de discovery, auditoria, estudo comparativo ou decisao de produto

## Proximas Acoes

- revisar o conteudo dos docs do FluXo ainda nao confirmados e aplicar a classificacao final
- criar tags editoriais para docs do FluXo, por exemplo `produto`, `spec`, `estudo`, `auditoria`, `legado`
- marcar docs legados explicitamente em vez de deixa-los competir com a fonte atual
- quando um doc tecnico do FluXo continuar valido, migrar primeiro o essencial para o repo e so depois descontinuar o original
