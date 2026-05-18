#!/bin/bash
# Abre SSH tunnel pro postgres da VPS e sobe o dev server
# Tunnel: WSL:15432 -> VPS -> fluxo-postgres:5432

SSH_KEY="C:\\Users\\guilh\\.ssh\\deploy_ed25519"
VPS="root@68.168.219.7"
VPS_PORT=2222
LOCAL_PORT=15432
PG_HOST="172.24.0.2"
PG_PORT=5432
DB_CHECK_HOST="${DEV_PRD_DB_HOST:-172.22.144.1}"
DB_CHECK_USER="fluxo_app"
DB_CHECK_NAME="fluxo"
DB_CHECK_PASSWORD="ecvWAmkw49zfVFT7WoysPUBwE1ckiJwdVDLlsQl70iI="

check_db() {
  DB_CHECK_HOST="$DB_CHECK_HOST" \
  DB_CHECK_PORT="$LOCAL_PORT" \
  DB_CHECK_USER="$DB_CHECK_USER" \
  DB_CHECK_NAME="$DB_CHECK_NAME" \
  DB_CHECK_PASSWORD="$DB_CHECK_PASSWORD" \
  node - <<'EOF' >/dev/null 2>&1
const { Client } = require('pg')

async function main() {
  const client = new Client({
    host: process.env.DB_CHECK_HOST,
    port: Number(process.env.DB_CHECK_PORT),
    user: process.env.DB_CHECK_USER,
    database: process.env.DB_CHECK_NAME,
    password: process.env.DB_CHECK_PASSWORD,
    connectionTimeoutMillis: 1000,
  })

  try {
    await client.connect()
    await client.query('SELECT 1')
  } finally {
    try {
      await client.end()
    } catch {
      // noop
    }
  }
}

main().catch(() => process.exit(1))
EOF
}

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ -n "$TUNNEL_PID" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "Fechando tunnel (PID $TUNNEL_PID)..."
    kill "$TUNNEL_PID" 2>/dev/null || true
    wait "$TUNNEL_PID" 2>/dev/null || true
  fi
  exit $status
}
trap cleanup EXIT INT TERM

# Abre tunnel em background
echo "Abrindo SSH tunnel..."
powershell.exe -NoProfile -Command "ssh -i '$SSH_KEY' -p $VPS_PORT -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=no -L 0.0.0.0:${LOCAL_PORT}:${PG_HOST}:${PG_PORT} -N $VPS" &
TUNNEL_PID=$!

# Espera tunnel ficar pronto
echo "Aguardando tunnel..."
for i in $(seq 1 10); do
  if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "ERRO: tunnel encerrou antes de conectar. Abortando."
    exit 1
  fi
  if check_db; then
    echo "Tunnel OK! Banco conectado."
    break
  fi
  if [ $i -eq 10 ]; then
    echo "ERRO: tunnel nao conectou em 10s. Abortando."
    kill $TUNNEL_PID 2>/dev/null
    exit 1
  fi
  sleep 1
done

# Sobe dev
echo "Subindo dev server..."
npx next dev --webpack --port 3005
