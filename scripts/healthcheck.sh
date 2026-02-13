#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

load_env_value() {
  local key="$1"
  local file="$2"
  if [ ! -f "$file" ]; then
    return 0
  fi
  local value
  value="$(grep -E "^${key}=" "$file" | tail -n1 | cut -d= -f2- | tr -d '\r')"
  if [ -n "$value" ]; then
    printf "%s" "$value"
  fi
}

CONVEX_URL="${CONVEX_URL:-$(load_env_value CONVEX_URL "$ROOT_DIR/.env.local")}"
if [ -z "$CONVEX_URL" ]; then
  CONVEX_DEPLOYMENT="$(load_env_value CONVEX_DEPLOYMENT "$ROOT_DIR/.env.local")"
  if [ -n "$CONVEX_DEPLOYMENT" ]; then
    CONVEX_URL="https://${CONVEX_DEPLOYMENT}.convex.cloud"
  fi
fi

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8787}"
RL_SERVICE_URL="${RL_SERVICE_URL:-http://127.0.0.1:9101}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
API_TOKEN="${API_TOKEN:-$(load_env_value API_TOKEN "$ROOT_DIR/backend/.env")}"

status=0

check_url() {
  local label="$1"
  local url="$2"
  local auth_header="${3:-}"
  local curl_flags=("-fsS" "--max-time" "2")
  if [ -n "$auth_header" ]; then
    if curl "${curl_flags[@]}" -H "$auth_header" "$url" >/dev/null 2>&1; then
      echo "ok  - ${label} (${url})"
    else
      echo "fail- ${label} (${url})"
      status=1
    fi
    return
  fi
  if curl "${curl_flags[@]}" "$url" >/dev/null 2>&1; then
    echo "ok  - ${label} (${url})"
  else
    echo "fail- ${label} (${url})"
    status=1
  fi
}

echo "Healthcheck:"
if [ -n "$CONVEX_URL" ]; then
  if [[ "$CONVEX_URL" == http://127.0.0.1:* ]] || [[ "$CONVEX_URL" == http://localhost:* ]]; then
    check_url "convex" "${CONVEX_URL}/instance_name"
  else
    check_url "convex" "${CONVEX_URL}"
  fi
else
  echo "warn- convex (CONVEX_URL not set)"
  status=1
fi
backend_auth_header=""
if [ -n "$API_TOKEN" ]; then
  backend_auth_header="Authorization: Bearer ${API_TOKEN}"
fi
check_url "backend" "${BACKEND_URL}/health" "$backend_auth_header"
check_url "rl-service" "${RL_SERVICE_URL}/health"

if curl -fsS --max-time 2 "$FRONTEND_URL" >/dev/null 2>&1; then
  echo "ok  - frontend (${FRONTEND_URL})"
else
  ALT_FRONTEND_URL="http://localhost:3001"
  if curl -fsS --max-time 2 "$ALT_FRONTEND_URL" >/dev/null 2>&1; then
    echo "ok  - frontend (${ALT_FRONTEND_URL})"
  else
    echo "fail- frontend (${FRONTEND_URL})"
    status=1
  fi
fi

exit "$status"
