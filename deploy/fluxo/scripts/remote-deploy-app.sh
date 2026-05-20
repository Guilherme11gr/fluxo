#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${STACK_DIR}/docker-compose.yml"
ENV_FILE="${FLUXO_ENV_FILE:-/opt/apps/fluxo/shared/config/fluxo.env}"
APP_SERVICE="${FLUXO_APP_SERVICE:-app}"
APP_CONTAINER="${FLUXO_APP_CONTAINER:-fluxo-app}"
APP_IMAGE="${FLUXO_APP_IMAGE:-}"
APP_DOMAIN="${APP_DOMAIN:-}"
HEALTHCHECK_PATH="${FLUXO_HEALTHCHECK_PATH:-/api/health}"
HEALTHCHECK_URL="${FLUXO_HEALTHCHECK_URL:-}"
HEALTHCHECK_RETRIES="${FLUXO_HEALTHCHECK_RETRIES:-30}"
HEALTHCHECK_INTERVAL="${FLUXO_HEALTHCHECK_INTERVAL:-2}"
REGISTRY="${FLUXO_REGISTRY:-}"
REGISTRY_USER="${FLUXO_REGISTRY_USER:-}"
REGISTRY_PASSWORD="${FLUXO_REGISTRY_PASSWORD:-}"
export DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"
export COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-1}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found at ${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Environment file not found at ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${APP_DOMAIN}" ]]; then
  APP_DOMAIN="$(grep -E '^APP_DOMAIN=' "${ENV_FILE}" | tail -n 1 | cut -d= -f2- || true)"
fi

if [[ -z "${HEALTHCHECK_URL}" ]]; then
  HEALTHCHECK_URL="https://127.0.0.1${HEALTHCHECK_PATH}"
fi

compose() {
  (
    cd "${STACK_DIR}"
    docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
  )
}

cleanup_registry_login() {
  if [[ -n "${REGISTRY:-}" && "${REGISTRY_LOGGED_IN:-0}" == "1" ]]; then
    docker logout "${REGISTRY}" >/dev/null 2>&1 || true
  fi
}

trap cleanup_registry_login EXIT

ensure_agent_api_keys_schema() {
  local migration_file="${STACK_DIR}/../../prisma/migrations/20260329_add_agent_api_keys/migration.sql"
  local postgres_container="${FLUXO_POSTGRES_CONTAINER_NAME:-fluxo-postgres}"

  : "${POSTGRES_USER:?POSTGRES_USER must be set in ${ENV_FILE}}"
  : "${POSTGRES_DB:?POSTGRES_DB must be set in ${ENV_FILE}}"

  if [[ ! -f "${migration_file}" ]]; then
    echo "Agent API key migration file not found at ${migration_file}" >&2
    exit 1
  fi

  local table_exists
  table_exists="$(docker exec -i "${postgres_container}" \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Atqc \
    "SELECT to_regclass('public.agent_api_keys') IS NOT NULL")"

  if [[ "${table_exists}" == "t" ]]; then
    echo "Agent API key schema already present"
    return
  fi

  echo "Applying agent API key schema migration"
  docker exec -i "${postgres_container}" \
    psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
      < "${migration_file}"
}

ensure_project_runtime_bindings_schema() {
  local migration_file="${STACK_DIR}/../../prisma/migrations/20260514_add_project_runtime_bindings/migration.sql"
  local postgres_container="${FLUXO_POSTGRES_CONTAINER_NAME:-fluxo-postgres}"

  : "${POSTGRES_USER:?POSTGRES_USER must be set in ${ENV_FILE}}"
  : "${POSTGRES_DB:?POSTGRES_DB must be set in ${ENV_FILE}}"

  if [[ ! -f "${migration_file}" ]]; then
    echo "Project runtime binding migration file not found at ${migration_file}" >&2
    exit 1
  fi

  local table_exists
  table_exists="$(docker exec -i "${postgres_container}" \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Atqc \
    "SELECT to_regclass('public.project_runtime_bindings') IS NOT NULL")"

  if [[ "${table_exists}" == "t" ]]; then
    echo "Project runtime binding schema already present"
  else
    echo "Applying project runtime binding schema migration"
    docker exec -i "${postgres_container}" \
      psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
      < "${migration_file}"
  fi

  echo "Ensuring project runtime binding provision columns"
  docker exec -i "${postgres_container}" \
    psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
    -c "ALTER TABLE public.project_runtime_bindings ADD COLUMN IF NOT EXISTS provision_command text, ADD COLUMN IF NOT EXISTS provision_cache_key text;"
}

ensure_agent_api_keys_schema
ensure_project_runtime_bindings_schema

if [[ -n "${APP_IMAGE}" ]]; then
  if [[ -z "${REGISTRY}" ]]; then
    REGISTRY="${APP_IMAGE%%/*}"
  fi

  if [[ -n "${REGISTRY_USER}${REGISTRY_PASSWORD}" ]]; then
    : "${REGISTRY_USER:?FLUXO_REGISTRY_USER must be set when using registry auth}"
    : "${REGISTRY_PASSWORD:?FLUXO_REGISTRY_PASSWORD must be set when using registry auth}"

    echo "Logging into ${REGISTRY} to pull ${APP_IMAGE}"
    printf '%s' "${REGISTRY_PASSWORD}" | docker login "${REGISTRY}" -u "${REGISTRY_USER}" --password-stdin >/dev/null
    REGISTRY_LOGGED_IN=1
  fi

  echo "Pulling ${APP_SERVICE} image ${APP_IMAGE}"
  compose pull "${APP_SERVICE}"
else
  echo "Building ${APP_SERVICE} image from ${STACK_DIR}"
  compose build "${APP_SERVICE}"
fi

echo "Restarting ${APP_SERVICE} container"
compose up -d --no-deps "${APP_SERVICE}"

echo "Waiting for ${APP_CONTAINER} to report running"
for attempt in $(seq 1 "${HEALTHCHECK_RETRIES}"); do
  container_state="$(docker inspect --format '{{.State.Status}}' "${APP_CONTAINER}" 2>/dev/null || true)"

  if [[ "${container_state}" == "running" ]]; then
    break
  fi

  if [[ "${attempt}" -eq "${HEALTHCHECK_RETRIES}" ]]; then
    echo "${APP_CONTAINER} did not reach running state" >&2
    compose logs --tail 200 "${APP_SERVICE}" >&2 || true
    exit 1
  fi

  sleep "${HEALTHCHECK_INTERVAL}"
done

echo "Waiting for healthcheck at ${HEALTHCHECK_URL}"
for attempt in $(seq 1 "${HEALTHCHECK_RETRIES}"); do
  curl_args=(
    --silent
    --show-error
    --fail
    --insecure
    "${HEALTHCHECK_URL}"
  )

  if [[ -n "${APP_DOMAIN}" ]]; then
    curl_args=(
      --silent
      --show-error
      --fail
      --insecure
      --header "Host: ${APP_DOMAIN}"
      "${HEALTHCHECK_URL}"
    )
  fi

  if response="$(curl "${curl_args[@]}")"; then
    echo "Healthcheck passed on attempt ${attempt}"
    echo "${response}"
    exit 0
  fi

  if [[ "${attempt}" -eq "${HEALTHCHECK_RETRIES}" ]]; then
    echo "Healthcheck failed after ${HEALTHCHECK_RETRIES} attempts" >&2
    compose logs --tail 200 "${APP_SERVICE}" >&2 || true
    exit 1
  fi

  sleep "${HEALTHCHECK_INTERVAL}"
done
