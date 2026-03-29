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

HOST="${APP_DOMAIN:?APP_DOMAIN must be set}"
BASE_URL="https://${HOST}"
COOKIE_JAR="$(mktemp)"
TMP_PREFIX="/tmp/fluxo-preview"
trap 'rm -f "${COOKIE_JAR}"' EXIT

rm -f "${TMP_PREFIX}-"*.json

echo "[smoke] health"
curl -k -sS \
  --resolve "${HOST}:443:127.0.0.1" \
  -o "${TMP_PREFIX}-health.json" \
  -w 'status=%{http_code}\n' \
  "${BASE_URL}/api/health"
cat "${TMP_PREFIX}-health.json"
echo

if [[ -n "${TEST_EMAIL:-}" && -n "${TEST_PASSWORD:-}" ]]; then
  echo "[smoke] sign-in existing user"
  curl -k -sS \
    --resolve "${HOST}:443:127.0.0.1" \
    -c "${COOKIE_JAR}" \
    -H "Origin: ${BASE_URL}" \
    -H "Content-Type: application/json" \
    -X POST "${BASE_URL}/api/auth/sign-in/email" \
    --data "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" \
    > "${TMP_PREFIX}-signin.json"
elif [[ "${CREATE_TEST_USER:-false}" == "true" ]]; then
  TEST_EMAIL="${TEST_EMAIL:-codex-preview-$(date +%s)@agenda-aqui.com}"
  TEST_PASSWORD="${TEST_PASSWORD:-FluxoPreview!123}"
  TEST_NAME="${TEST_NAME:-Codex Preview}"
  TEST_ORG_NAME="${TEST_ORG_NAME:-Fluxo Preview Workspace}"

  echo "[smoke] sign-up new user"
  curl -k -sS \
    --resolve "${HOST}:443:127.0.0.1" \
    -c "${COOKIE_JAR}" \
    -H "Origin: ${BASE_URL}" \
    -H "Content-Type: application/json" \
    -X POST "${BASE_URL}/api/auth/sign-up/email" \
    --data "{\"name\":\"${TEST_NAME}\",\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" \
    > "${TMP_PREFIX}-signup.json"

  echo "[smoke] bootstrap workspace"
  curl -k -sS \
    --resolve "${HOST}:443:127.0.0.1" \
    -b "${COOKIE_JAR}" \
    -c "${COOKIE_JAR}" \
    -H "Origin: ${BASE_URL}" \
    -H "Content-Type: application/json" \
    -X POST "${BASE_URL}/api/account/bootstrap" \
    --data "{\"orgName\":\"${TEST_ORG_NAME}\",\"displayName\":\"${TEST_NAME}\"}" \
    > "${TMP_PREFIX}-bootstrap.json"
else
  echo "[smoke] no auth test requested; set TEST_EMAIL/TEST_PASSWORD or CREATE_TEST_USER=true"
  exit 0
fi

echo "[smoke] session"
curl -k -sS \
  --resolve "${HOST}:443:127.0.0.1" \
  -b "${COOKIE_JAR}" \
  "${BASE_URL}/api/auth/get-session" \
  > "${TMP_PREFIX}-session.json"

echo "[smoke] users/me"
curl -k -sS \
  --resolve "${HOST}:443:127.0.0.1" \
  -b "${COOKIE_JAR}" \
  "${BASE_URL}/api/users/me" \
  > "${TMP_PREFIX}-me.json"

test -f "${TMP_PREFIX}-signup.json" && cat "${TMP_PREFIX}-signup.json" && echo
test -f "${TMP_PREFIX}-bootstrap.json" && cat "${TMP_PREFIX}-bootstrap.json" && echo
test -f "${TMP_PREFIX}-signin.json" && cat "${TMP_PREFIX}-signin.json" && echo
cat "${TMP_PREFIX}-session.json" && echo
cat "${TMP_PREFIX}-me.json" && echo
