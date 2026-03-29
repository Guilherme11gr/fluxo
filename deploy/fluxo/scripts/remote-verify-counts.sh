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

CONTAINER_NAME="${FLUXO_POSTGRES_CONTAINER_NAME:-fluxo-postgres}"
SOURCE_CLIENT_IMAGE="${SOURCE_POSTGRES_CLIENT_IMAGE:-postgres:17-alpine}"
SOURCE_PGSSLMODE="${SOURCE_PGSSLMODE:-require}"

TABLES=(
  "auth.users"
  "public.organizations"
  "public.user_profiles"
  "public.org_memberships"
  "public.projects"
  "public.project_docs"
  "public.epics"
  "public.features"
  "public.tasks"
  "public.invites"
  "public.audit_logs"
)

query_source_count() {
  local schema="$1"
  local table="$2"

  docker run --rm \
    -e PGSSLMODE="${SOURCE_PGSSLMODE}" \
    -e SOURCE_DATABASE_URL="${FROM_DATABASE_URL}" \
    "${SOURCE_CLIENT_IMAGE}" \
    sh -lc "psql \"\${SOURCE_DATABASE_URL}\" -Atqc 'SELECT COUNT(*) FROM \"${schema}\".\"${table}\"'" \
    | tr -d '[:space:]'
}

query_target_count() {
  local schema="$1"
  local table="$2"

  docker exec "${CONTAINER_NAME}" \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Atqc \
    "SELECT COUNT(*) FROM \"${schema}\".\"${table}\"" \
    | tr -d '[:space:]'
}

has_mismatch=0

for item in "${TABLES[@]}"; do
  schema="${item%%.*}"
  table="${item##*.}"
  source_count="$(query_source_count "${schema}" "${table}")"
  target_count="$(query_target_count "${schema}" "${table}")"
  status="ok"

  if [[ "${source_count}" != "${target_count}" ]]; then
    status="mismatch"
    has_mismatch=1
  fi

  printf '%-9s %-24s source=%s target=%s\n' "${status}" "${item}" "${source_count}" "${target_count}"
done

exit "${has_mismatch}"
