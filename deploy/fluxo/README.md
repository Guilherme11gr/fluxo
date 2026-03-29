# Fluxo VPS Deploy

This directory contains the production deployment assets for the Fluxo stack.

## Layout

- `docker-compose.yml`: app + private PostgreSQL stack
- `.env.example`: environment variables template
- `postgres/init/001-extensions.sql`: required PostgreSQL extensions
- `postgres/patches/001-better-auth.sql`: idempotent Better Auth patch for restored databases
- `postgres/patches/002-migrate-supabase-auth.sql`: migrates Supabase auth users/accounts into Better Auth tables
- `scripts/backup-postgres.sh`: logical dump with 7-day retention
- `scripts/reset-target-db.sh`: resets only the `auth` and `public` schemas in the dedicated Fluxo database
- `scripts/remote-cutover.sh`: runs the full Supabase -> Fluxo import on the VPS using Dockerized Postgres clients
- `scripts/remote-verify-counts.sh`: compares critical table counts between source and target
- `scripts/preview-smoke-test.sh`: validates preview health and optional auth flows through Traefik

## Deployment model

- `Traefik` terminates TLS on the existing external `proxy` network
- `fluxo-postgres` is private on the internal Docker network only
- `fluxo-app` is the only service exposed through Traefik

## Migration flow

- Set `FROM_DATABASE_URL` in `deploy/fluxo/.env`
- Run `deploy/fluxo/scripts/remote-cutover.sh`
- Validate with `deploy/fluxo/scripts/remote-verify-counts.sh`
- Validate preview with `deploy/fluxo/scripts/preview-smoke-test.sh`

## GitHub Actions deploy

- Workflow: `.github/workflows/deploy-fluxo.yml`
- Pull requests into `main` run the verification gate only
- Pushes to `main` and manual runs from `main` deploy to the VPS after the gate passes
- The workflow syncs the repository to the VPS, rebuilds only `fluxo-app`, restarts it, and waits for `/api/health`
- The initial verification gate is intentionally lightweight and validates dependency installation plus workflow wiring; the authoritative production build still happens on the VPS during deploy

### Required repository secrets

- `FLUXO_VPS_SSH_KEY`: private key used by GitHub Actions to reach the VPS
- `FLUXO_VPS_KNOWN_HOSTS`: pinned SSH host key entry for the VPS

### Required repository variables

- `FLUXO_VPS_HOST`: VPS hostname or IP
- `FLUXO_VPS_PORT`: SSH port, for example `2222`
- `FLUXO_VPS_USER`: deploy user, for example `root`

### Optional repository variables

- `FLUXO_VPS_DEPLOY_PATH`: defaults to `/opt/apps/fluxo/current`
- `FLUXO_VPS_ENV_FILE`: defaults to `/opt/apps/fluxo/shared/config/fluxo.env`
- `FLUXO_HEALTHCHECK_URL`: defaults to `https://fluxo.agenda-aqui.com/api/health`

### Recommended setup

- Store the workflow under a protected GitHub `production` environment if you want manual approvals
- Generate `FLUXO_VPS_KNOWN_HOSTS` with `ssh-keyscan -p <port> <host>`
- Keep application secrets only in `/opt/apps/fluxo/shared/config/fluxo.env`; they do not need to exist in GitHub
- Re-run the workflow with `workflow_dispatch` for manual redeploys without opening a new commit

## Notes

- Keep the database private; do not publish `5432`
- Prefer accessing PostgreSQL for maintenance through `docker exec` or an SSH tunnel
- Replace the transitional Supabase variables after the Better Auth migration lands
- The chosen default is to preserve bcrypt passwords; `force_password_reset` stays `false` unless you opt into it explicitly
