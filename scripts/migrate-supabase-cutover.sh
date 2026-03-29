#!/usr/bin/env bash
set -euo pipefail

: "${FROM_DATABASE_URL:?FROM_DATABASE_URL is required}"
: "${TO_DATABASE_URL:?TO_DATABASE_URL is required}"
: "${ALLOW_TARGET_RESET:?Set ALLOW_TARGET_RESET=true to continue}"

if [[ "${ALLOW_TARGET_RESET}" != "true" ]]; then
  echo "ALLOW_TARGET_RESET precisa ser 'true' para evitar restore acidental no banco errado."
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump nao encontrado."
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore nao encontrado."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql nao encontrado."
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./tmp/migrations}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${BACKUP_DIR}/supabase-${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

echo "[cutover] gerando dump auth+public em ${DUMP_FILE}"
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --schema=auth \
  --schema=public \
  --file="${DUMP_FILE}" \
  "${FROM_DATABASE_URL}"

echo "[cutover] restaurando dump no destino"
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="${TO_DATABASE_URL}" \
  "${DUMP_FILE}"

echo "[cutover] aplicando patch do Better Auth"
psql "${TO_DATABASE_URL}" \
  --file="deploy/fluxo/postgres/patches/001-better-auth.sql"

echo "[cutover] migrando auth.users para Better Auth"
psql "${TO_DATABASE_URL}" \
  --file="deploy/fluxo/postgres/patches/002-migrate-supabase-auth.sql"

echo "[cutover] concluido. dump salvo em ${DUMP_FILE}"
