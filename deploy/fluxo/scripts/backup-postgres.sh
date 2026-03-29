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

BACKUP_DIR="${FLUXO_POSTGRES_BACKUPS_DIR:-${STACK_DIR}/postgres/backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/fluxo-${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

docker exec fluxo-postgres pg_dump \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  -Fc \
  -f "/backups/$(basename "${BACKUP_FILE}")"

find "${BACKUP_DIR}" -type f -name 'fluxo-*.dump' -mtime +7 -delete

echo "Backup created: ${BACKUP_FILE}"
