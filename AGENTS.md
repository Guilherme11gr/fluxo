# AGENTS.md — FluXo (jt-kill)

## Commands

```bash
npm run dev          # Dev server on :3005 (uses --webpack flag)
npm run build        # prisma generate → rm .next → next build --webpack
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run test         # vitest (env: node, pattern: src/**/*.spec.ts(x))
npm run db:generate   # prisma generate
npm run db:push      # prisma db push
npm run db:migrate    # prisma migrate dev
npm run db:studio     # prisma studio
```

**Quality gate (required before REVIEW/DONE):** `npm run build && npm run test && npm run typecheck`

Pre-commit hook is disabled (`.husky/pre-commit.disabled`). Husky is present but not actively gating.

## Architecture

Next.js 16+ App Router monorepo-ish project. TypeScript strict mode. Runs on port **3005**.

```
src/
  app/            # Next.js routes (thin controllers only)
  domain/use-cases/  # Pure business logic, no framework deps
  infra/adapters/     # Supabase, external API implementations
  server/services/   # SSR/BFF composition, React cache/revalidateTag
  shared/             # DTOs, types, validators, utils, errors, HTTP helpers
  hooks/              # React hooks (extract from components)
  components/         # UI (shadcn/ui + Tailwind v4)
  config/             # App config
  providers/          # React context providers
  lib/                # Misc shared lib
  types/              # Global type defs
```

**Critical layering rules:**
- Routes → call use cases/services → never contain business logic or direct data access
- Use cases are pure/testable, depend only on port interfaces, never know about HTTP/Next.js
- `server/services` are for SSR composition + caching, not for re-implementing business rules
- `infra/adapters` implement ports — Supabase, external APIs — no domain logic here

## Auth & Multi-Tenancy

- Auth: **better-auth** (not Supabase Auth)
- Multi-tenant: all entities belong to an Organization (tenantId)
- Protected routes MUST use `extractAuthenticatedTenant(supabase)` from `shared/http/`
- DB uses Prisma with multi-schema (`auth` + `public`)

## Database

- **Prisma ORM** with PostgreSQL (Supabase)
- Multi-schema: `auth` and `public` (see `prisma/schema.prisma` — `previewFeatures = ["multiSchema"]`)
- `DATABASE_URL` must use session pooler (port 6543, pgbouncer=true)
- `DIRECT_URL` must use direct connection (port 5432) — needed for migrations
- Schema changes: `npm run db:push` for dev, `npm run db:migrate` for tracked migrations

## Key Conventions

### Date Handling (CRITICAL)
- ALWAYS use `@/shared/utils/date-utils` — NEVER use date-fns directly
- Backend/DB: always UTC. UI: always `America/Sao_Paulo`
- See `docs/guides/date-handling.md` before touching dates

### Money
- Store in **cents** (integer) in domain/use-cases
- Format only at UI boundary via `formatPrice()` from `@/shared/utils/formatters`

### Phone
- Display with mask via `formatPhone()`: `(XX) XXXXX-XXXX`

### Styling
- Tailwind CSS v4 only — NO separate CSS files or CSS-in-JS
- shadcn/ui components (`new-york` style, see `components.json`)
- Dark mode first and mandatory
- Animations: prefer opacity/color/transform — avoid animating dimensions (scale/width/height)

### Path alias
- `@/*` maps to `./src/*`

### Prisma Client
- Auto-generated on `npm install` via `postinstall` script
- If Prisma models change, run `npm run db:generate`

## Env Setup

Copy `.env.example` → `.env.local`. Required values:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL` (pooler) / `DIRECT_URL` (direct)
- `DEEPSEEK_API_KEY` (or configure `FLUXO_CHAT_*` / `ZAI_*` for alternative AI provider)
- `ADMIN_SECRET` (for protected API endpoints)
- Optional: `TELEGRAM_BOT_TOKEN`, GitHub integration vars

## Sub-projects

### MCP Server (`mcp-server/`)
- Separate `package.json` / `tsconfig.json` — NOT part of main build
- Dev: `cd mcp-server && npm run dev` (tsx)
- Build: `cd mcp-server && npm run build`
- Registered in `.mcp.json` at repo root
- 27 tools for task/epic/feature/project management via Agent API

### Runner (`runner/`)
- Node.js polling agent for task execution
- Config: `runner/config.yaml`
- Run: `node runner/runner.js` (continuous) or `--once` flag

### Runner Go (`runner-go/`)
- Go binary alternative to `runner/`
- Build: `go build -o fluxo-runner .`

### Agent SDK (`packages/agent-sdk/`)
- Local npm package linked via `"file:packages/agent-sdk"` in root package.json
- Consumer skill for FluXo's Agent API

## Deploy

- **Vercel** (primary): auto-deploy on push to `main`
- **VPS** (Docker): CI builds image → rsync to VPS → deploy script
- See `deploy/fluxo/` for VPS deploy scripts
- Build command: `prisma generate && next build --webpack` (standalone output)
- After visual changes: increment `VERSION` in `public/sw.js` for PWA cache bust

## Testing

- Vitest, node environment, files matching `src/**/*.spec.ts(x)`
- No snapshot or integration test infrastructure observed
- Use cases should have matching `.md` documentation (per project convention)

## Task Status Workflow

`BACKLOG → TODO → DOING → REVIEW → QA_READY → DONE`

Bug workflow: QA can click "Report Bug" on a Feature, creating a linked BUG Task that blocks the Feature.

## Existing Instruction Sources

- `.github/instructions/copilot-instructions.md` — detailed architecture rules, coding standards, quality gates
- `.clinerules/mcp-jt-kill.md` — MCP server usage guide for AI agents
- `AGENT_API.md` — Agent API endpoint reference
- `docs/AI-CONTEXT.md` — AI context summary