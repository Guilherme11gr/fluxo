# FluXo

App principal em Next.js 16 + React 19 para gestao multi-tenant de projetos, tasks e agentes.

## Desenvolvimento

```bash
npm install
npm run dev
```

- App local: `http://localhost:3005`
- `npm run dev` usa `next dev --webpack --port 3005`
- `npm run dev:turbo` existe, mas o fluxo padrao do repo usa `--webpack`

## Verificacao

```bash
npm run build
npm run test
npm run typecheck
npm run lint
```

- Handoff local minimo: `npm run build && npm run test && npm run typecheck`
- CI atual nao executa esse gate completo; o workflow `verify` roda apenas `npm ci`

## Env

- Copie `.env.example` para `.env.local`
- Ajuste `NEXT_PUBLIC_APP_URL` para `http://localhost:3005`
- `DATABASE_URL`: URL pooler do Supabase
- `DIRECT_URL`: URL direta `5432` para migracoes

## Estrutura

```text
src/app                 # rotas e endpoints Next.js
src/domain/use-cases    # logica de negocio
src/infra/adapters      # Prisma, Supabase, AI, repositorios
src/shared              # tipos, helpers HTTP, utils
src/components          # UI
src/hooks               # hooks React
```

## Docs Mantidos

- `AGENTS.md`
- `.github/instructions/copilot-instructions.md`
- `docs/architecture/overview.md`
- `docs/architecture/domain-model.md`
- `docs/architecture/workflows.md`
- `docs/guides/date-handling.md`
- `docs/guides/cache-invalidation-patterns.md`
- `docs/ui-ux/standards.md`
