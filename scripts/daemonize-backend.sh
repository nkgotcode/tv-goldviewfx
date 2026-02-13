#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.pids"
API_PID="$PID_DIR/backend-api.pid"
JOBS_PID="$PID_DIR/backend-jobs.pid"
RL_PID="$PID_DIR/rl-service.pid"
API_LOG="$ROOT_DIR/backend-api.log"
JOBS_LOG="$ROOT_DIR/backend-jobs.log"
RL_LOG="$ROOT_DIR/rl-service.log"

load_env() {
  if [ -f "$ROOT_DIR/backend/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$ROOT_DIR/backend/.env"
    set +a
  fi
}

resolve_rl_port() {
  if [ -n "${RL_SERVICE_URL:-}" ] && [[ "$RL_SERVICE_URL" =~ :([0-9]+)(/|$) ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  echo "${RL_SERVICE_PORT:-9101}"
}

is_running() {
  local pid_file="$1"
  if [ ! -f "$pid_file" ]; then
    return 1
  fi
  local pid
  pid=$(cat "$pid_file")
  if [ -z "$pid" ]; then
    return 1
  fi
  if kill -0 "$pid" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

start_api() {
  if is_running "$API_PID"; then
    echo "API already running (PID $(cat "$API_PID"))"
    return
  fi
  nohup bun run "$ROOT_DIR/backend/src/api/server.ts" >"$API_LOG" 2>&1 &
  echo $! >"$API_PID"
  echo "API started (PID $(cat "$API_PID"))"
}

start_jobs() {
  if is_running "$JOBS_PID"; then
    echo "Worker already running (PID $(cat "$JOBS_PID"))"
    return
  fi
  nohup bun run "$ROOT_DIR/backend/src/jobs/worker.ts" >"$JOBS_LOG" 2>&1 &
  echo $! >"$JOBS_PID"
  echo "Worker started (PID $(cat "$JOBS_PID"))"
}

start_rl() {
  if is_running "$RL_PID"; then
    echo "RL service already running (PID $(cat "$RL_PID"))"
    return
  fi
  if ! command -v uv >/dev/null 2>&1; then
    echo "uv not found. Install it before starting the RL service." >&2
    return 1
  fi
  local rl_port
  rl_port="$(resolve_rl_port)"
  nohup bash -c 'cd "$1" && RL_SERVICE_PORT="$2" uv run uvicorn server:app --host 0.0.0.0 --port "$2"' _ "$ROOT_DIR/backend/rl-service" "$rl_port" >"$RL_LOG" 2>&1 &
  echo $! >"$RL_PID"
  echo "RL service started (PID $(cat "$RL_PID")) on port $rl_port"
}

stop_proc() {
  local pid_file="$1"
  local label="$2"
  if is_running "$pid_file"; then
    kill "$(cat "$pid_file")"
    rm -f "$pid_file"
    echo "$label stopped"
  else
    echo "$label not running"
  fi
}

status_proc() {
  local pid_file="$1"
  local label="$2"
  if is_running "$pid_file"; then
    echo "$label running (PID $(cat "$pid_file"))"
  else
    echo "$label stopped"
  fi
}

mkdir -p "$PID_DIR"
load_env

case "${1:-}" in
  start)
    start_api
    start_jobs
    start_rl
    ;;
  stop)
    stop_proc "$API_PID" "API"
    stop_proc "$JOBS_PID" "Worker"
    stop_proc "$RL_PID" "RL service"
    ;;
  restart)
    stop_proc "$API_PID" "API"
    stop_proc "$JOBS_PID" "Worker"
    stop_proc "$RL_PID" "RL service"
    start_api
    start_jobs
    start_rl
    ;;
  status)
    status_proc "$API_PID" "API"
    status_proc "$JOBS_PID" "Worker"
    status_proc "$RL_PID" "RL service"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
 esac
