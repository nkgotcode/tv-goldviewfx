#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="$ROOT_DIR/.pids"
API_PID="$PID_DIR/backend-api.pid"
JOBS_PID="$PID_DIR/backend-jobs.pid"
API_LOG="$ROOT_DIR/backend-api.log"
JOBS_LOG="$ROOT_DIR/backend-jobs.log"

load_env() {
  if [ -f "$ROOT_DIR/backend/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$ROOT_DIR/backend/.env"
    set +a
  fi
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
    ;;
  stop)
    stop_proc "$API_PID" "API"
    stop_proc "$JOBS_PID" "Worker"
    ;;
  restart)
    stop_proc "$API_PID" "API"
    stop_proc "$JOBS_PID" "Worker"
    start_api
    start_jobs
    ;;
  status)
    status_proc "$API_PID" "API"
    status_proc "$JOBS_PID" "Worker"
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 1
    ;;
 esac
