# Visao Geral

## Stack Real

- Next.js 16 App Router
- React 19
- TypeScript strict
- Tailwind CSS v4 + shadcn/ui
- Prisma + Postgres multi-schema (`auth`, `public`)
- `better-auth` com adapter Prisma

## Estrutura Que Vale Seguir

```text
src/app                 # rotas e endpoints Next.js
src/domain/use-cases    # logica de negocio
src/infra/adapters      # repositorios Prisma, Supabase, AI
src/shared              # tipos, utils e helpers HTTP
src/components          # UI
src/hooks               # hooks React
```

## Limites de Camada

### Routes

- validam request
- autenticam
- chamam use case ou repositorio existente
- serializam resposta HTTP

### Use cases

- concentram regra de negocio
- nao conhecem Next.js, HTTP ou UI

### Adapters

- falam com Prisma, Supabase e APIs externas
- nao devem esconder regra de dominio

## Realidade Do Repo

- `src/infra/adapters/prisma/index.ts` exporta o singleton Prisma e instancias de repositorio.
- Muitos endpoints em `src/app/api/**` importam repositorios direto desse arquivo. Ao editar codigo existente, siga esse padrao local em vez de refatorar a arquitetura inteira incidentalmente.
- `src/shared/http/auth.helpers.ts` concentra auth de usuario autenticado.
- `src/shared/http/agent-auth.ts` concentra auth da Agent API.

## Regras De Implementacao

- use `extractAuthenticatedTenant()` em rotas protegidas por sessao
- use `extractAgentAuth()` em `src/app/api/agent/**`
- dinheiro fica em centavos no dominio
- datas usam apenas `@/shared/utils/date-utils`
- formatacao pertence a UI, nao ao dominio
