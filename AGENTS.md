# AGENTS.md — jt-kill / FluXo

## Read First

- Prefer executable config over prose. Repo docs still mix `FluXo`, `Jira Killer`, and `Agenda Aqui`.
- Keep `.github/instructions/copilot-instructions.md` and this file as the main agent guidance.
- Ignore `.github/agents/*` for repo conventions: it targets another project, says light mode first, and references a non-existent `npm run type-check` script.

## Root App

- Main app is the root package: Next.js 16 App Router, React 19, strict TypeScript, Tailwind v4, Prisma, `better-auth`.
- Dev server is `http://localhost:3005`: `npm run dev`.
- `npm run dev:turbo` uses plain `next dev`; the default `dev` and `build` scripts intentionally use `--webpack`.

```bash
npm run build       # prisma generate, delete .next, next build --webpack
npm run test        # vitest
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
```

- Focused test: `npm run test -- src/path/to/file.spec.ts`
- Root Vitest only picks up `src/**/*.spec.ts(x)` and runs in `node`; browser/component test setup is not part of the root app.
- `npm run build` already runs `prisma generate`. Use `npm run db:generate` only when you need a Prisma client refresh without a full build.
- Prefer Prisma scripts for schema work: `npm run db:push` for dev sync, `npm run db:migrate` for tracked migrations. Older docs that say `mcp supabase` are stale for this repo.

## Verification

- Current repo-local handoff check is `npm run build && npm run test && npm run typecheck`; run `npm run lint` too when touching app code.
- GitHub Actions currently only runs `npm ci` in the `verify` job. Do not assume CI will catch build, test, or typecheck failures.

## Architecture Reality

- `src/domain/use-cases/**` is the intended home for business logic and usually has adjacent `*.spec.ts` tests.
- `src/infra/adapters/prisma/index.ts` exports the Prisma singleton plus repository instances. Many existing API routes already import repositories directly from there.
- When editing an existing endpoint, match the local pattern unless the task is explicitly an architecture refactor; do not create broad route-to-use-case churn as incidental cleanup.
- Protected user routes should use `extractAuthenticatedTenant()` from `src/shared/http/auth.helpers.ts`. It resolves org context from `x-org-id`, then `jt-current-org`, then the default membership.
- Agent API routes under `src/app/api/agent/**` use `extractAgentAuth()` instead of session auth.

## Domain Gotchas

- Auth is `better-auth` with Prisma adapter, not Supabase Auth.
- Multi-tenant model is `Organization -> Project -> Epic -> Feature -> Task`; task workflow includes `QA_READY`.
- Prisma uses multi-schema Postgres (`auth`, `public`). `DATABASE_URL` should be the Supabase session-pooler URL; `DIRECT_URL` should be the direct `5432` URL for migrations.
- Dates: use only `@/shared/utils/date-utils`; backend/database stay UTC, UI uses `America/Sao_Paulo`.
- Money: keep cents in domain/use cases; format only at the UI boundary.
- Phone display uses `formatPhone()`.

## UI

- Tailwind CSS only; shadcn config is `new-york` with CSS variables in `src/app/globals.css`.
- Dark theme is the real default (`ThemeProvider` uses `defaultTheme="dark"` and `enableSystem={false}`), even though some old docs say otherwise.

## Separate Packages And Tools

- `packages/agent-sdk` is a local `file:` dependency used by the app (`@guilherme/agent-sdk/{next,react,core}`). If you edit it, run `npm run build` in `packages/agent-sdk`; root checks do not rebuild it for you.
- `mcp-server/` is its own package and tsconfig. `.mcp.json` points at `mcp-server/dist/index.js`, so source changes require `npm run build` in `mcp-server`.
- `runner/` and `runner-go/` are standalone worker tools, not part of the root app quality gate.
- `runner/`: `node runner.js --once` runs a single pass.
- `runner-go/`: `go build -o fluxo-runner .` builds the binary; `./fluxo-runner run --once` runs one pass.
- The checked-in `runner/config.yaml` currently points at another repo/workdir; do not treat it as local setup for `jt-kill`.

## Env Gotcha

- `.env.example` still shows `NEXT_PUBLIC_APP_URL=http://localhost:3000`, but the actual dev server is `:3005`. For auth, GitHub install, or local callback work, use `http://localhost:3005` for app/auth URLs.
