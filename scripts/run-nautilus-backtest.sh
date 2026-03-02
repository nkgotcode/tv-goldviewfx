#!/usr/bin/env bash
set -euo pipefail

# One-command Nautilus evaluation runner with optional confirm-heal backfill flow.
# Defaults target BTC-USDT from 2023-01-01 to now over 5m + 15m/1h/4h/1d context.

API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:8787}"
API_TOKEN="${API_TOKEN:-}"
AGENT_ID="${AGENT_ID:-gold-rl-agent}"
PAIR="${PAIR:-BTC-USDT}"
PERIOD_START="${PERIOD_START:-2023-01-01T00:00:00Z}"
PERIOD_END="${PERIOD_END:-now}"
BASE_INTERVAL="${BASE_INTERVAL:-5m}"
CONTEXT_INTERVALS="${CONTEXT_INTERVALS:-15m,1h,4h,1d}"
BACKTEST_MODE="${BACKTEST_MODE:-l1}"
MAX_BATCHES="${MAX_BATCHES:-10000}"
POLL_SECONDS="${POLL_SECONDS:-8}"
RETRY_QUEUE_LIMIT="${RETRY_QUEUE_LIMIT:-200}"
ACTOR="${ACTOR:-cli}"
OPS_ROLE="${OPS_ROLE:-operator}"
AUGMENT_ON_GAP="${AUGMENT_ON_GAP:-true}"
RUN_GAP_MONITOR="${RUN_GAP_MONITOR:-true}"
USE_FULL_HISTORY="${USE_FULL_HISTORY:-true}"
CURL_CONNECT_TIMEOUT_SEC="${CURL_CONNECT_TIMEOUT_SEC:-10}"
CURL_MAX_TIME_SEC="${CURL_MAX_TIME_SEC:-0}"
STALE_PROCESSING_SEC="${STALE_PROCESSING_SEC:-900}"
STALE_PROCESSING_POLLS="${STALE_PROCESSING_POLLS:-40}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/run-nautilus-backtest.sh [options]

Options:
  --api-base-url URL          API base URL (default: http://127.0.0.1:8787)
  --api-token TOKEN           Bearer token (or set API_TOKEN)
  --agent-id ID               Agent id (default: gold-rl-agent)
  --pair SYMBOL               Trading pair (default: BTC-USDT)
  --start ISO8601             Period start (default: 2023-01-01T00:00:00Z)
  --end ISO8601|now           Period end (default: now)
  --interval VAL              Base interval (default: 5m)
  --context CSV               Context intervals CSV (default: 15m,1h,4h,1d)
  --mode l1|l2|l3             Nautilus backtest mode (default: l1)
  --max-batches N             Heal/backfill max batches (default: 10000)
  --poll-seconds N            Poll interval seconds (default: 8)
  --augment-on-gap true|false Trigger confirm-heal when gap-blocked (default: true)
  --run-gap-monitor true|false Run gap monitor in confirm-heal (default: true)
  --full-history true|false   Use full DB history without downsample (default: true)
  --help                      Show this help

Examples:
  ./scripts/run-nautilus-backtest.sh
  ./scripts/run-nautilus-backtest.sh --pair BTC-USDT --start 2023-01-01T00:00:00Z --end now
  API_BASE_URL=https://<api-host> API_TOKEN=... ./scripts/run-nautilus-backtest.sh
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-base-url) API_BASE_URL="$2"; shift 2 ;;
    --api-token) API_TOKEN="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --pair) PAIR="$2"; shift 2 ;;
    --start) PERIOD_START="$2"; shift 2 ;;
    --end) PERIOD_END="$2"; shift 2 ;;
    --interval) BASE_INTERVAL="$2"; shift 2 ;;
    --context) CONTEXT_INTERVALS="$2"; shift 2 ;;
    --mode) BACKTEST_MODE="$2"; shift 2 ;;
    --max-batches) MAX_BATCHES="$2"; shift 2 ;;
    --poll-seconds) POLL_SECONDS="$2"; shift 2 ;;
    --augment-on-gap) AUGMENT_ON_GAP="$2"; shift 2 ;;
    --run-gap-monitor) RUN_GAP_MONITOR="$2"; shift 2 ;;
    --full-history) USE_FULL_HISTORY="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

for cmd in curl jq date; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

if [[ "$PERIOD_END" == "now" ]]; then
  PERIOD_END="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

AUTH_HEADERS=()
if [[ -n "$API_TOKEN" ]]; then
  AUTH_HEADERS=(-H "Authorization: Bearer $API_TOKEN")
fi

log() {
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" >&2
}

log_kv() {
  local key="$1"
  local value="${2:-}"
  printf '  - %s: %s\n' "$key" "$value" >&2
}

call_api() {
  local method="$1"
  local path="$2"
  local payload_file="${3:-}"
  local output_file="$4"
  log "HTTP ${method} ${API_BASE_URL}${path}"
  if [[ -n "$payload_file" ]]; then
    local payload_bytes
    payload_bytes="$(wc -c < "$payload_file" | tr -d ' ')"
    log_kv "payload_file" "$payload_file"
    log_kv "payload_bytes" "$payload_bytes"
  fi
  local status_file="${output_file}.status"
  local curl_rc_file="${output_file}.curl_rc"
  rm -f "$status_file" "$curl_rc_file"

  if [[ -n "$payload_file" ]]; then
    (
      set +e
      if [[ "$CURL_MAX_TIME_SEC" == "0" ]]; then
        curl -sS \
          --connect-timeout "$CURL_CONNECT_TIMEOUT_SEC" \
          -o "$output_file" -w "%{http_code}" \
          -X "$method" "${API_BASE_URL}${path}" \
          "${AUTH_HEADERS[@]}" \
          -H "Content-Type: application/json" \
          -H "x-actor: ${ACTOR}" \
          -H "x-ops-role: ${OPS_ROLE}" \
          --data-binary "@${payload_file}" > "$status_file"
      else
        curl -sS \
          --connect-timeout "$CURL_CONNECT_TIMEOUT_SEC" \
          --max-time "$CURL_MAX_TIME_SEC" \
          -o "$output_file" -w "%{http_code}" \
          -X "$method" "${API_BASE_URL}${path}" \
          "${AUTH_HEADERS[@]}" \
          -H "Content-Type: application/json" \
          -H "x-actor: ${ACTOR}" \
          -H "x-ops-role: ${OPS_ROLE}" \
          --data-binary "@${payload_file}" > "$status_file"
      fi
      echo "$?" > "$curl_rc_file"
    ) &
  else
    (
      set +e
      if [[ "$CURL_MAX_TIME_SEC" == "0" ]]; then
        curl -sS \
          --connect-timeout "$CURL_CONNECT_TIMEOUT_SEC" \
          -o "$output_file" -w "%{http_code}" \
          -X "$method" "${API_BASE_URL}${path}" \
          "${AUTH_HEADERS[@]}" \
          -H "x-actor: ${ACTOR}" \
          -H "x-ops-role: ${OPS_ROLE}" > "$status_file"
      else
        curl -sS \
          --connect-timeout "$CURL_CONNECT_TIMEOUT_SEC" \
          --max-time "$CURL_MAX_TIME_SEC" \
          -o "$output_file" -w "%{http_code}" \
          -X "$method" "${API_BASE_URL}${path}" \
          "${AUTH_HEADERS[@]}" \
          -H "x-actor: ${ACTOR}" \
          -H "x-ops-role: ${OPS_ROLE}" > "$status_file"
      fi
      echo "$?" > "$curl_rc_file"
    ) &
  fi

  local curl_pid="$!"
  local elapsed=0
  while kill -0 "$curl_pid" >/dev/null 2>&1; do
    sleep 5
    elapsed=$((elapsed + 5))
    log "HTTP in-flight: ${method} ${path} elapsed=${elapsed}s"
  done
  wait "$curl_pid" || true

  local curl_rc="1"
  if [[ -f "$curl_rc_file" ]]; then
    curl_rc="$(cat "$curl_rc_file")"
  fi
  if [[ "$curl_rc" != "0" ]]; then
    log "curl request failed with exit_code=${curl_rc}"
    return 1
  fi

  local http_status="000"
  if [[ -f "$status_file" ]]; then
    http_status="$(cat "$status_file")"
  fi
  log_kv "http_status" "$http_status"
  log_kv "response_file" "$output_file"
  printf '%s' "$http_status"
}

gap_snapshot() {
  log "Collecting gap health snapshot (pair=${PAIR}, source=bingx_candles)"
  local out_file="$WORK_DIR/gap_health.json"
  local status
  status="$(call_api "GET" "/ops/gaps/health?pair=${PAIR}&source_type=bingx_candles&limit=100" "" "$out_file")"
  if [[ "$status" != "200" ]]; then
    log "Gap health snapshot unavailable (HTTP $status)"
    return 0
  fi
  local open healing last_detected oldest
  open="$(jq -r '.totals.open // 0' "$out_file")"
  healing="$(jq -r '.totals.healing // 0' "$out_file")"
  last_detected="$(jq -r '.totals.last_detected_at // "n/a"' "$out_file")"
  oldest="$(jq -r '.totals.oldest_open_at // "n/a"' "$out_file")"
  log "Gap health: open=$open healing=$healing last_detected=$last_detected oldest_open=$oldest"
}

print_report_summary() {
  local report_file="$1"
  echo
  echo "========== Final Backtest Summary =========="
  jq -r '
    def as_pct(v):
      if (v == null) then "n/a"
      else ((v * 100) | tostring) + "%" end;

    "report.id: \(.id // "n/a")",
    "report.status: \(.status // "n/a")",
    "pair: \(.pair // "n/a")",
    "backtest_run_id: \(.backtest_run_id // "n/a")",
    "dataset_hash: \(.dataset_hash // "n/a")",
    "win_rate: \((.win_rate // 0) | tostring)",
    "net_pnl_after_fees: \((.net_pnl_after_fees // 0) | tostring)",
    "max_drawdown: \((.max_drawdown // 0) | tostring)",
    "trade_count: \((.trade_count // 0) | tostring)",
    "",
    "interval_matrix.successful_count: \((.metadata.nautilus.metrics.interval_matrix.successful_count // 0) | tostring)",
    "interval_matrix.failed_count: \((.metadata.nautilus.metrics.interval_matrix.failed_count // 0) | tostring)",
    "interval_matrix.reason_codes: \(((.metadata.nautilus.metrics.interval_matrix.reason_codes // []) | join(",")))",
    "",
    "Per-interval results:",
    (
      ((.metadata.nautilus.metrics.interval_matrix.results // []) | if length == 0 then ["- n/a"] else . end)
      | if type == "array" and (.[0] | type) == "string" then .[]
        else .[] | "- interval=\(.interval // "n/a") status=\(.status // "n/a") trades=\(.metrics.trade_count // 0) win_rate=\(.metrics.win_rate // 0) pnl=\(.metrics.net_pnl_after_fees // 0) drawdown=\(.metrics.max_drawdown // 0) reasons=\(((.reason_codes // []) | join(",")))"
        end
    ),
    "",
    "Execution steps:",
    (
      ((.metadata.execution.steps // []) | if length == 0 then ["- n/a"] else . end)
      | if type == "array" and (.[0] | type) == "string" then .[]
        else .[] | "- \(.key // "n/a"): \(.status // "n/a") duration_ms=\(.duration_ms // 0)"
        end
    ),
    "",
    "Window autoscale:",
    "- requested_window_size=\(.metadata.window_autoscale.requested_window_size // "n/a") effective_window_size=\(.metadata.window_autoscale.window_size // "n/a") requested_window_count=\(.metadata.window_autoscale.requested_window_count // "n/a") effective_window_count=\(.metadata.window_autoscale.effective_window_count // "n/a") stride_used=\(.metadata.window_autoscale.stride // "n/a")"
  ' "$report_file"
  echo "==========================================="
}

fetch_latest_report_for_pair() {
  log "Resolving latest evaluation report for pair=${PAIR}"
  local out_file="$1"
  local list_file="$WORK_DIR/evaluations_list.json"
  local status
  status="$(call_api "GET" "/agents/${AGENT_ID}/evaluations?limit=100" "" "$list_file")"
  if [[ "$status" != "200" ]]; then
    log "Failed to fetch evaluations list (HTTP $status)"
    return 1
  fi
  jq --arg pair "$PAIR" '
    map(select((.pair // "") == $pair))
    | sort_by(.created_at // "")
    | last // empty
  ' "$list_file" > "$out_file"

  if [[ ! -s "$out_file" ]] || [[ "$(jq -r 'type' "$out_file" 2>/dev/null)" != "object" ]]; then
    log "No matching evaluation report found yet for pair=$PAIR"
    return 1
  fi
  local resolved_id resolved_created_at
  resolved_id="$(jq -r '.id // "n/a"' "$out_file")"
  resolved_created_at="$(jq -r '.created_at // "n/a"' "$out_file")"
  log_kv "resolved_report_id" "$resolved_id"
  log_kv "resolved_created_at" "$resolved_created_at"
}

log "Phase 1/5: Preparing evaluation request"
RUN_STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
log "Config: pair=$PAIR start=$PERIOD_START end=$PERIOD_END interval=$BASE_INTERVAL context=$CONTEXT_INTERVALS full_history=$USE_FULL_HISTORY mode=$BACKTEST_MODE"
log_kv "run_started_at" "$RUN_STARTED_AT"
log_kv "api_base_url" "$API_BASE_URL"
log_kv "agent_id" "$AGENT_ID"
log_kv "augment_on_gap" "$AUGMENT_ON_GAP"
log_kv "run_gap_monitor" "$RUN_GAP_MONITOR"
log_kv "max_batches" "$MAX_BATCHES"
log_kv "poll_seconds" "$POLL_SECONDS"
log_kv "curl_connect_timeout_sec" "$CURL_CONNECT_TIMEOUT_SEC"
log_kv "curl_max_time_sec" "$CURL_MAX_TIME_SEC"
log_kv "stale_processing_sec" "$STALE_PROCESSING_SEC"
log_kv "stale_processing_polls" "$STALE_PROCESSING_POLLS"

iso_to_epoch() {
  local iso="$1"
  if [[ -z "$iso" || "$iso" == "n/a" ]]; then
    echo 0
    return 0
  fi
  local clean
  clean="$(printf '%s' "$iso" | sed -E 's/\.[0-9]+Z$/Z/; s/Z$//')"
  if command -v gdate >/dev/null 2>&1; then
    gdate -u -d "${clean}Z" +%s 2>/dev/null || echo 0
    return 0
  fi
  if date -u -d "${clean}Z" +%s >/dev/null 2>&1; then
    date -u -d "${clean}Z" +%s 2>/dev/null || echo 0
    return 0
  fi
  date -u -j -f "%Y-%m-%dT%H:%M:%S" "$clean" +%s 2>/dev/null || echo 0
}

EVAL_PAYLOAD_FILE="$WORK_DIR/evaluation_payload.json"
log "Building evaluation payload JSON"
jq -n \
  --arg pair "$PAIR" \
  --arg start "$PERIOD_START" \
  --arg end "$PERIOD_END" \
  --arg interval "$BASE_INTERVAL" \
  --arg context_csv "$CONTEXT_INTERVALS" \
  --arg mode "$BACKTEST_MODE" \
  --argjson full_history "$USE_FULL_HISTORY" \
  '
  {
    pair: $pair,
    periodStart: $start,
    periodEnd: $end,
    interval: $interval,
    contextIntervals: ($context_csv | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0))),
    fullHistory: $full_history,
    backtestMode: $mode
  }
  ' > "$EVAL_PAYLOAD_FILE"
log "Evaluation payload created"
jq . "$EVAL_PAYLOAD_FILE" | sed 's/^/  payload> /'

log "Phase 2/5: Running primary evaluation request"
PRIMARY_RESPONSE="$WORK_DIR/primary_response.json"
PRIMARY_STATUS="$(call_api "POST" "/agents/${AGENT_ID}/evaluations" "$EVAL_PAYLOAD_FILE" "$PRIMARY_RESPONSE")"
log "Primary evaluation HTTP status: $PRIMARY_STATUS"

if [[ "$PRIMARY_STATUS" == "202" ]]; then
  log "Phase 3/5: Evaluation completed without gap block"
  log "Primary response preview:"
  jq '{id, status, pair, backtest_run_id, created_at}' "$PRIMARY_RESPONSE" | sed 's/^/  response> /'
  print_report_summary "$PRIMARY_RESPONSE"
  exit 0
fi

if [[ "$PRIMARY_STATUS" != "409" ]]; then
  log "Evaluation failed with non-recoverable response:"
  jq . "$PRIMARY_RESPONSE" || cat "$PRIMARY_RESPONSE"
  exit 1
fi

if [[ "$AUGMENT_ON_GAP" != "true" ]]; then
  log "Evaluation was gap-blocked and --augment-on-gap is false."
  jq . "$PRIMARY_RESPONSE" || cat "$PRIMARY_RESPONSE"
  exit 2
fi

log "Phase 3/5: Gap block detected. Starting confirm-heal + rerun."
log "Gap-block response summary:"
jq '{error, code, blocking, interval, blocking_reasons, warnings, confirm_heal_endpoint}' "$PRIMARY_RESPONSE" | sed 's/^/  gap> /'
gap_snapshot

HEAL_PAYLOAD_FILE="$WORK_DIR/heal_payload.json"
log "Building confirm-heal payload JSON"
jq -n \
  --slurpfile eval "$EVAL_PAYLOAD_FILE" \
  --argjson max_batches "$MAX_BATCHES" \
  --argjson run_gap_monitor "$RUN_GAP_MONITOR" \
  '
  {
    evaluation: $eval[0],
    heal: {
      confirm: true,
      intervals: (($eval[0].contextIntervals + [$eval[0].interval]) | unique),
      maxBatches: $max_batches,
      runGapMonitor: $run_gap_monitor
    }
  }
  ' > "$HEAL_PAYLOAD_FILE"
log "Confirm-heal payload created"
jq . "$HEAL_PAYLOAD_FILE" | sed 's/^/  payload> /'

HEAL_RESPONSE="$WORK_DIR/heal_response.json"
log "Submitting confirm-heal request"
HEAL_STATUS="$(call_api "POST" "/agents/${AGENT_ID}/evaluations/confirm-heal" "$HEAL_PAYLOAD_FILE" "$HEAL_RESPONSE")"
log "Confirm-heal HTTP status: $HEAL_STATUS"

if [[ "$HEAL_STATUS" != "202" ]]; then
  log "Confirm-heal failed:"
  jq . "$HEAL_RESPONSE" || cat "$HEAL_RESPONSE"
  exit 1
fi

# Immediate inline result path
if jq -e '.report != null' "$HEAL_RESPONSE" >/dev/null 2>&1; then
  log "Phase 4/5: Confirm-heal returned inline report"
  log "Heal summary:"
  jq -r '.heal | "status=\(.status) max_batches=\(.max_batches) gap_monitor_ran=\(.gap_monitor_ran) warnings=\((.warnings // []) | length)"' "$HEAL_RESPONSE"
  log "Inline report header:"
  jq '.report | {id, status, pair, backtest_run_id, created_at}' "$HEAL_RESPONSE" | sed 's/^/  report> /'
  jq '.report' "$HEAL_RESPONSE" > "$WORK_DIR/final_report.json"
  log "Phase 5/5: Final stats"
  print_report_summary "$WORK_DIR/final_report.json"
  exit 0
fi

if ! jq -e '.queued == true and (.operation_id // "") != ""' "$HEAL_RESPONSE" >/dev/null 2>&1; then
  log "Unexpected confirm-heal response:"
  jq . "$HEAL_RESPONSE" || cat "$HEAL_RESPONSE"
  exit 1
fi

OPERATION_ID="$(jq -r '.operation_id' "$HEAL_RESPONSE")"
log "Phase 4/5: Confirm-heal queued as operation_id=$OPERATION_ID; polling retry queue"
log_kv "retry_queue_limit" "$RETRY_QUEUE_LIMIT"
log_kv "poll_interval_seconds" "$POLL_SECONDS"

LAST_STATUS=""
LAST_UPDATED_AT=""
UNCHANGED_UPDATED_AT_POLLS=0
POLL_COUNT=0
START_TS="$(date +%s)"
while true; do
  POLL_COUNT=$((POLL_COUNT + 1))
  log "Retry queue poll cycle #$POLL_COUNT"
  QUEUE_FILE="$WORK_DIR/retry_queue_poll.json"
  QUEUE_STATUS="$(call_api "GET" "/ops/retry-queue?limit=${RETRY_QUEUE_LIMIT}" "" "$QUEUE_FILE")"
  if [[ "$QUEUE_STATUS" != "200" ]]; then
    log "Retry queue poll failed (HTTP $QUEUE_STATUS), retrying in ${POLL_SECONDS}s"
    sleep "$POLL_SECONDS"
    continue
  fi

  ITEM_FILE="$WORK_DIR/retry_item.json"
  jq --arg id "$OPERATION_ID" 'map(select(.id == $id)) | .[0] // {}' "$QUEUE_FILE" > "$ITEM_FILE"
  CURRENT_STATUS="$(jq -r '.status // "missing"' "$ITEM_FILE")"
  ATTEMPTS="$(jq -r '.attempts // 0' "$ITEM_FILE")"
  MAX_ATTEMPTS="$(jq -r '.max_attempts // 0' "$ITEM_FILE")"
  LAST_ERROR="$(jq -r '.last_error // ""' "$ITEM_FILE")"
  ELAPSED="$(( $(date +%s) - START_TS ))"
  NEXT_ATTEMPT_AT="$(jq -r '.next_attempt_at // "n/a"' "$ITEM_FILE")"
  UPDATED_AT="$(jq -r '.updated_at // "n/a"' "$ITEM_FILE")"
  UPDATED_AT_EPOCH="$(iso_to_epoch "$UPDATED_AT")"
  NOW_EPOCH="$(date +%s)"
  if [[ "$UPDATED_AT_EPOCH" -gt 0 ]]; then
    PROCESSING_AGE_SEC="$((NOW_EPOCH - UPDATED_AT_EPOCH))"
    if [[ "$PROCESSING_AGE_SEC" -lt 0 ]]; then
      PROCESSING_AGE_SEC=0
    fi
  else
    PROCESSING_AGE_SEC=0
  fi

  if [[ "$UPDATED_AT" == "$LAST_UPDATED_AT" ]]; then
    UNCHANGED_UPDATED_AT_POLLS=$((UNCHANGED_UPDATED_AT_POLLS + 1))
  else
    UNCHANGED_UPDATED_AT_POLLS=0
    LAST_UPDATED_AT="$UPDATED_AT"
  fi

  log_kv "operation_status" "$CURRENT_STATUS"
  log_kv "attempts" "$ATTEMPTS/$MAX_ATTEMPTS"
  log_kv "next_attempt_at" "$NEXT_ATTEMPT_AT"
  log_kv "updated_at" "$UPDATED_AT"
  log_kv "processing_age_sec" "$PROCESSING_AGE_SEC"
  log_kv "unchanged_updated_at_polls" "$UNCHANGED_UPDATED_AT_POLLS"
  log_kv "elapsed_seconds" "$ELAPSED"

  if [[ "$CURRENT_STATUS" != "$LAST_STATUS" ]]; then
    log "Operation status changed: status=$CURRENT_STATUS attempts=$ATTEMPTS/$MAX_ATTEMPTS elapsed=${ELAPSED}s"
    if [[ -n "$LAST_ERROR" ]]; then
      log "last_error=$LAST_ERROR"
    fi
    LAST_STATUS="$CURRENT_STATUS"
  else
    log "Polling: status=$CURRENT_STATUS attempts=$ATTEMPTS/$MAX_ATTEMPTS elapsed=${ELAPSED}s"
  fi

  if (( POLL_COUNT % 3 == 0 )); then
    gap_snapshot
  fi

  if [[ "$CURRENT_STATUS" == "processing" && "$PROCESSING_AGE_SEC" -ge "$STALE_PROCESSING_SEC" ]]; then
    log "Detected stale processing state (age=${PROCESSING_AGE_SEC}s >= threshold=${STALE_PROCESSING_SEC}s)."
    log "The retry worker likely got stuck in a long/hung handler. Aborting poll loop."
    log "Stale queue item snapshot:"
    jq . "$ITEM_FILE" || true
    log "Suggested next checks:"
    log "1) Inspect worker logs for retry-queue/evaluation_confirm_heal stack traces."
    log "2) Verify scheduler job 'retry-queue' is still running (not blocked by a hung in-flight job)."
    log "3) Re-run with smaller period/interval chunk or run manual backfill first, then evaluation."
    exit 3
  fi

  if [[ "$CURRENT_STATUS" == "processing" && "$UNCHANGED_UPDATED_AT_POLLS" -ge "$STALE_PROCESSING_POLLS" ]]; then
    log "Detected stale processing state (updated_at unchanged for ${UNCHANGED_UPDATED_AT_POLLS} polls)."
    log "This indicates the queued handler is likely hung."
    log "Stale queue item snapshot:"
    jq . "$ITEM_FILE" || true
    exit 3
  fi

  if [[ "$CURRENT_STATUS" == "succeeded" ]]; then
    break
  fi
  if [[ "$CURRENT_STATUS" == "failed" ]]; then
    log "Operation failed:"
    jq . "$ITEM_FILE" || cat "$ITEM_FILE"
    exit 1
  fi
  sleep "$POLL_SECONDS"
done

log "Phase 5/5: Fetching latest evaluation report and printing final stats"
FINAL_REPORT="$WORK_DIR/final_report.json"
if ! fetch_latest_report_for_pair "$FINAL_REPORT"; then
  log "Could not resolve final report automatically. Latest queue item:"
  jq . "$WORK_DIR/retry_item.json" || true
  exit 1
fi
log "Final report file ready: $FINAL_REPORT"
print_report_summary "$FINAL_REPORT"
