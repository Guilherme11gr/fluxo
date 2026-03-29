#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${STACK_DIR}/docker-compose.yml"
ENV_FILE="${FLUXO_ENV_FILE:-/opt/apps/fluxo/shared/config/fluxo.env}"
APP_SERVICE="${FLUXO_APP_SERVICE:-app}"
APP_CONTAINER="${FLUXO_APP_CONTAINER:-fluxo-app}"
APP_DOMAIN="${APP_DOMAIN:-}"
HEALTHCHECK_PATH="${FLUXO_HEALTHCHECK_PATH:-/api/health}"
HEALTHCHECK_URL="${FLUXO_HEALTHCHECK_URL:-}"
HEALTHCHECK_RETRIES="${FLUXO_HEALTHCHECK_RETRIES:-30}"
HEALTHCHECK_INTERVAL="${FLUXO_HEALTHCHECK_INTERVAL:-2}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found at ${COMPOSE_FILE}" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Environment file not found at ${ENV_FILE}" >&2
  exit 1
fi

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

echo "Building ${APP_SERVICE} image from ${STACK_DIR}"
compose build "${APP_SERVICE}"

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
