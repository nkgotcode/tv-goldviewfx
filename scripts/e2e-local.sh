#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8787}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
RL_SERVICE_PORT="${RL_SERVICE_PORT:-9101}"
BACKEND_LOG="${BACKEND_LOG:-$ROOT_DIR/backend-api.log}"
FRONTEND_LOG="${FRONTEND_LOG:-$ROOT_DIR/frontend-dev.log}"
RL_SERVICE_LOG="${RL_SERVICE_LOG:-$ROOT_DIR/rl-service.log}"
FRONTEND_LOCK="$ROOT_DIR/frontend/.next/dev/lock"

is_port_in_use() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 1
}

resolve_port() {
  local port="$1"
  while is_port_in_use "$port"; do
    port=$((port + 1))
  done
  printf "%s" "$port"
}

BACKEND_PORT="$(resolve_port "$BACKEND_PORT")"
FRONTEND_PORT="$(resolve_port "$FRONTEND_PORT")"
RL_SERVICE_PORT="$(resolve_port "$RL_SERVICE_PORT")"

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun runtime not found. Install it before running this script." >&2
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "uv not found. Install it before running this script." >&2
  exit 1
fi

if [ ! -f "$ROOT_DIR/tradingview.html" ]; then
  echo "Missing TradingView fixture: $ROOT_DIR/tradingview.html" >&2
  exit 1
fi

if [ ! -f "$ROOT_DIR/tests/e2e/fixtures/telegram_messages.json" ]; then
  echo "Missing Telegram fixture: $ROOT_DIR/tests/e2e/fixtures/telegram_messages.json" >&2
  exit 1
fi

if [ -z "${CONVEX_URL:-}" ] && [ -f "$ROOT_DIR/.env.local" ]; then
  CONVEX_URL="$(grep -E '^CONVEX_URL=' "$ROOT_DIR/.env.local" | tail -n1 | cut -d= -f2- | tr -d '\r')"
fi

if [ -z "${CONVEX_URL:-}" ] && [ -f "$ROOT_DIR/.env.local" ]; then
  CONVEX_DEPLOYMENT="$(grep -E '^CONVEX_DEPLOYMENT=' "$ROOT_DIR/.env.local" | tail -n1 | cut -d= -f2- | tr -d '\r')"
  if [ -n "$CONVEX_DEPLOYMENT" ]; then
    CONVEX_URL="https://${CONVEX_DEPLOYMENT}.convex.cloud"
  fi
fi

if [ -z "${CONVEX_URL:-}" ]; then
  echo "CONVEX_URL is required. Set it or run npx convex dev to populate .env.local." >&2
  exit 1
fi

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID"
  fi
  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID"
  fi
  if [ -n "${RL_SERVICE_PID:-}" ] && kill -0 "$RL_SERVICE_PID" >/dev/null 2>&1; then
    kill "$RL_SERVICE_PID"
  fi
}

trap cleanup EXIT

CONVEX_URL="$CONVEX_URL" \
E2E_RUN=1 \
ALLOW_LIVE_SIMULATION=true \
BINGX_MARKET_DATA_MOCK="${BINGX_MARKET_DATA_MOCK:-true}" \
TRADINGVIEW_USE_HTML=true \
TRADINGVIEW_HTML_PATH="$ROOT_DIR/tradingview.html" \
FETCH_FULL=false \
TELEGRAM_MESSAGES_PATH="$ROOT_DIR/tests/e2e/fixtures/telegram_messages.json" \
API_TOKEN= \
RL_SERVICE_URL="http://localhost:$RL_SERVICE_PORT" \
PORT="$BACKEND_PORT" \
bash -c 'cd "$1" && bun --no-env-file run dev' _ "$ROOT_DIR/backend" > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

RL_SERVICE_PORT="$RL_SERVICE_PORT" \
bash -c 'cd "$1" && uv run uvicorn server:app --host 0.0.0.0 --port "$2"' _ "$ROOT_DIR/backend/rl-service" "$RL_SERVICE_PORT" > "$RL_SERVICE_LOG" 2>&1 &
RL_SERVICE_PID=$!

if [ -f "$FRONTEND_LOCK" ]; then
  rm -f "$FRONTEND_LOCK"
fi
if [ -d "$ROOT_DIR/frontend/.next" ]; then
  rm -rf "$ROOT_DIR/frontend/.next"
fi

NEXT_PUBLIC_API_BASE_URL="http://localhost:$BACKEND_PORT" \
NEXT_PUBLIC_API_TOKEN= \
PORT="$FRONTEND_PORT" \
bash -c 'cd "$1" && bun --no-env-file run dev' _ "$ROOT_DIR/frontend" > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

for _ in {1..40}; do
  if curl -fs "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

for _ in {1..40}; do
  if curl -fs "http://localhost:$RL_SERVICE_PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

for _ in {1..40}; do
  if curl -fs "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fs "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
  echo "Backend failed to start. See $BACKEND_LOG" >&2
  exit 1
fi

if ! curl -fs "http://localhost:$RL_SERVICE_PORT/health" >/dev/null 2>&1; then
  echo "RL service failed to start. See $RL_SERVICE_LOG" >&2
  exit 1
fi

if ! curl -fs "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
  echo "Frontend failed to start. See $FRONTEND_LOG" >&2
  exit 1
fi

CONVEX_URL="$CONVEX_URL" \
E2E_RESET_TOKEN="${E2E_RESET_TOKEN:-local-e2e}" \
bun run "$ROOT_DIR/scripts/e2e-setup.ts"

E2E_RUN=1 \
E2E_SETUP_DONE=1 \
E2E_BASE_URL="http://localhost:$FRONTEND_PORT" \
E2E_DASHBOARD_BASE_URL="http://localhost:$FRONTEND_PORT" \
E2E_API_BASE_URL="http://localhost:$BACKEND_PORT" \
BINGX_MARKET_DATA_MOCK="${BINGX_MARKET_DATA_MOCK:-true}" \
API_TOKEN= \
bash -c 'cd "$1" && bun run test:e2e' _ "$ROOT_DIR"
