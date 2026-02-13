#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8787}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
RL_SERVICE_PORT="${RL_SERVICE_PORT:-9101}"
BACKEND_LOG="${BACKEND_LOG:-$ROOT_DIR/backend-api.log}"
JOBS_LOG="${JOBS_LOG:-$ROOT_DIR/backend-jobs.log}"
FRONTEND_LOG="${FRONTEND_LOG:-$ROOT_DIR/frontend-dev.log}"
RL_SERVICE_LOG="${RL_SERVICE_LOG:-$ROOT_DIR/rl-service.log}"

load_env() {
  if [ -f "$ROOT_DIR/backend/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$ROOT_DIR/backend/.env"
    set +a
  fi
  if [ -z "${CONVEX_URL:-}" ] && [ -f "$ROOT_DIR/.env.local" ]; then
    CONVEX_URL="$(grep -E '^CONVEX_URL=' "$ROOT_DIR/.env.local" | tail -n1 | cut -d= -f2- | tr -d '\r')"
    export CONVEX_URL
  fi
}

is_port_in_use() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 1
}

assert_port_free() {
  local port="$1"
  local label="$2"
  if is_port_in_use "$port"; then
    echo "$label port $port is already in use. Stop the process or set ${label}_PORT." >&2
    exit 1
  fi
}

cleanup() {
  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID"
  fi
  if [ -n "${JOBS_PID:-}" ] && kill -0 "$JOBS_PID" >/dev/null 2>&1; then
    kill "$JOBS_PID"
  fi
  if [ -n "${API_PID:-}" ] && kill -0 "$API_PID" >/dev/null 2>&1; then
    kill "$API_PID"
  fi
  if [ -n "${RL_SERVICE_PID:-}" ] && kill -0 "$RL_SERVICE_PID" >/dev/null 2>&1; then
    kill "$RL_SERVICE_PID"
  fi
}

trap cleanup EXIT

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun runtime not found. Install it before running this script." >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Install it before running this script." >&2
  exit 1
fi

load_env

assert_port_free "$BACKEND_PORT" "BACKEND"
assert_port_free "$FRONTEND_PORT" "FRONTEND"
assert_port_free "$RL_SERVICE_PORT" "RL_SERVICE"

RL_SERVICE_URL="http://localhost:$RL_SERVICE_PORT"
export RL_SERVICE_URL

PORT="$BACKEND_PORT" \
bash -c 'cd "$1" && bun run src/api/server.ts' _ "$ROOT_DIR/backend" > "$BACKEND_LOG" 2>&1 &
API_PID=$!

PORT="$BACKEND_PORT" \
bash -c 'cd "$1" && bun run src/jobs/worker.ts' _ "$ROOT_DIR/backend" > "$JOBS_LOG" 2>&1 &
JOBS_PID=$!

RL_SERVICE_PORT="$RL_SERVICE_PORT" \
bash -c 'cd "$1" && uv run uvicorn server:app --host 0.0.0.0 --port "$2"' _ "$ROOT_DIR/backend/rl-service" "$RL_SERVICE_PORT" > "$RL_SERVICE_LOG" 2>&1 &
RL_SERVICE_PID=$!

NEXT_PUBLIC_API_BASE_URL="http://localhost:$BACKEND_PORT" \
NEXT_PUBLIC_API_TOKEN="${API_TOKEN:-}" \
PORT="$FRONTEND_PORT" \
bash -c 'cd "$1" && bun run dev' _ "$ROOT_DIR/frontend" > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

echo "Backend API   : http://localhost:$BACKEND_PORT (log: $BACKEND_LOG)"
echo "Backend worker: log at $JOBS_LOG"
echo "RL service    : http://localhost:$RL_SERVICE_PORT (log: $RL_SERVICE_LOG)"
echo "Frontend      : http://localhost:$FRONTEND_PORT (log: $FRONTEND_LOG)"

wait "$API_PID"
