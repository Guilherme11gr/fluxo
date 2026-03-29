#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${FLUXO_ENV_FILE:-/opt/apps/fluxo/shared/config/fluxo.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

: "${FROM_DATABASE_URL:?Set FROM_DATABASE_URL in ${ENV_FILE} or export it before running.}"
: "${ALLOW_TARGET_RESET:?Set ALLOW_TARGET_RESET=true to confirm destructive reset on the Fluxo target DB.}"

if [[ "${ALLOW_TARGET_RESET}" != "true" ]]; then
  echo "ALLOW_TARGET_RESET precisa ser 'true' para continuar." >&2
  exit 1
fi

CONTAINER_NAME="${FLUXO_POSTGRES_CONTAINER_NAME:-fluxo-postgres}"
SOURCE_CLIENT_IMAGE="${SOURCE_POSTGRES_CLIENT_IMAGE:-postgres:17-alpine}"
TARGET_CLIENT_IMAGE="${TARGET_POSTGRES_CLIENT_IMAGE:-${POSTGRES_CLIENT_IMAGE:-postgres:17-alpine}}"
NETWORK_NAME="${FLUXO_INTERNAL_NETWORK_NAME:-fluxo_fluxo-internal}"
SOURCE_PGSSLMODE="${SOURCE_PGSSLMODE:-require}"
BACKUP_DIR="${FLUXO_POSTGRES_BACKUPS_DIR:-${STACK_DIR}/postgres/backups}/cutover"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
SOURCE_DUMP_BASENAME="supabase-${TIMESTAMP}.dump"
TARGET_BACKUP_BASENAME="fluxo-pre-cutover-${TIMESTAMP}.dump"
TARGET_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${CONTAINER_NAME}:5432/${POSTGRES_DB}"
SCHEMA_PATCH="${STACK_DIR}/postgres/patches/001-better-auth.sql"
DATA_PATCH="${STACK_DIR}/postgres/patches/002-migrate-supabase-auth.sql"

mkdir -p "${BACKUP_DIR}"

echo "[cutover] backing up current target to ${BACKUP_DIR}/${TARGET_BACKUP_BASENAME}"
docker exec "${CONTAINER_NAME}" pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -Fc \
  -f "/backups/cutover/${TARGET_BACKUP_BASENAME}"

echo "[cutover] resetting dedicated target database"
"${SCRIPT_DIR}/reset-target-db.sh"

echo "[cutover] dumping auth/public from source"
docker run --rm \
  -e PGSSLMODE="${SOURCE_PGSSLMODE}" \
  -e SOURCE_DATABASE_URL="${FROM_DATABASE_URL}" \
  -e DUMP_BASENAME="${SOURCE_DUMP_BASENAME}" \
  -v "${BACKUP_DIR}:/backups" \
  "${SOURCE_CLIENT_IMAGE}" \
  sh -lc 'pg_dump --format=custom --no-owner --no-privileges --schema=auth --schema=public --file="/backups/${DUMP_BASENAME}" "${SOURCE_DATABASE_URL}"'

echo "[cutover] restoring dump into ${CONTAINER_NAME}"
docker run --rm \
  --network "${NETWORK_NAME}" \
  -e TARGET_DATABASE_URL="${TARGET_DATABASE_URL}" \
  -e DUMP_BASENAME="${SOURCE_DUMP_BASENAME}" \
  -v "${BACKUP_DIR}:/backups" \
  "${TARGET_CLIENT_IMAGE}" \
  sh -lc 'pg_restore --no-owner --no-privileges --dbname="${TARGET_DATABASE_URL}" "/backups/${DUMP_BASENAME}"'

echo "[cutover] applying Better Auth schema patch"
docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  < "${SCHEMA_PATCH}"

echo "[cutover] migrating Supabase auth records into Better Auth tables"
docker exec -i "${CONTAINER_NAME}" \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  < "${DATA_PATCH}"

echo "[cutover] validating critical table counts"
"${SCRIPT_DIR}/remote-verify-counts.sh"

echo "[cutover] done"
echo "  source dump: ${BACKUP_DIR}/${SOURCE_DUMP_BASENAME}"
echo "  target backup: ${BACKUP_DIR}/${TARGET_BACKUP_BASENAME}"
