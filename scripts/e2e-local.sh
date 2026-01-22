#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8787}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_LOG="${BACKEND_LOG:-$ROOT_DIR/backend-api.log}"
FRONTEND_LOG="${FRONTEND_LOG:-$ROOT_DIR/frontend-dev.log}"

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

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install it before running this script." >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun runtime not found. Install it before running this script." >&2
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

cleanup() {
  if [ -n "${BACKEND_PID:-}" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID"
  fi
  if [ -n "${FRONTEND_PID:-}" ] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID"
  fi
}

trap cleanup EXIT

supabase start
RESET_OUTPUT=""
if ! RESET_OUTPUT="$(supabase db reset --local 2>&1)"; then
  if printf "%s" "$RESET_OUTPUT" | grep -qi "error status 502\|invalid response was received from the upstream server"; then
    echo "Supabase reset returned a 502 during restart; waiting for services to recover."
    for _ in {1..3}; do
      if supabase status --output json >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
  else
    echo "$RESET_OUTPUT" >&2
    exit 1
  fi
fi


SUPABASE_STATUS_RAW="$(supabase status --output json)"
SUPABASE_STATUS="$(printf "%s" "$SUPABASE_STATUS_RAW" | awk 'BEGIN{start=0} {if ($0 ~ /^{/) start=1; if (start) print }')"
SUPABASE_URL="$(printf "%s" "$SUPABASE_STATUS" | bun -e 'const fs = require("fs"); const data = JSON.parse(fs.readFileSync(0, "utf8")); console.log(data.API_URL);')"
SUPABASE_SERVICE_ROLE_KEY="$(printf "%s" "$SUPABASE_STATUS" | bun -e 'const fs = require("fs"); const data = JSON.parse(fs.readFileSync(0, "utf8")); console.log(data.SERVICE_ROLE_KEY);')"

SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
E2E_RUN=1 \
ALLOW_LIVE_SIMULATION=true \
RL_SERVICE_MOCK=true \
BINGX_MARKET_DATA_MOCK=true \
TRADINGVIEW_USE_HTML=true \
TRADINGVIEW_HTML_PATH="$ROOT_DIR/tradingview.html" \
FETCH_FULL=false \
TELEGRAM_MESSAGES_PATH="$ROOT_DIR/tests/e2e/fixtures/telegram_messages.json" \
API_TOKEN= \
PORT="$BACKEND_PORT" \
bash -c 'cd "$1" && bun run dev' _ "$ROOT_DIR/backend" > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

NEXT_PUBLIC_API_BASE_URL="http://localhost:$BACKEND_PORT" \
NEXT_PUBLIC_API_TOKEN= \
PORT="$FRONTEND_PORT" \
bash -c 'cd "$1" && bun run dev' _ "$ROOT_DIR/frontend" > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

for _ in {1..40}; do
  if curl -fs "http://localhost:$BACKEND_PORT/health" >/dev/null 2>&1; then
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

if ! curl -fs "http://localhost:$FRONTEND_PORT" >/dev/null 2>&1; then
  echo "Frontend failed to start. See $FRONTEND_LOG" >&2
  exit 1
fi

E2E_RUN=1 \
E2E_BASE_URL="http://localhost:$FRONTEND_PORT" \
E2E_DASHBOARD_BASE_URL="http://localhost:$FRONTEND_PORT" \
E2E_API_BASE_URL="http://localhost:$BACKEND_PORT" \
API_TOKEN= \
bash -c 'cd "$1" && bun run test:e2e' _ "$ROOT_DIR"
