#!/usr/bin/env bash
set -euo pipefail

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
}

fatal() {
  log "ERROR: $*"
  exit 1
}

require_var() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    fatal "Missing required env var: ${key}"
  fi
}

trim() {
  local value="$1"
  value="${value#${value%%[![:space:]]*}}"
  value="${value%${value##*[![:space:]]}}"
  printf '%s' "$value"
}

split_csv() {
  local csv="$1"
  local -n out_ref=$2
  out_ref=()

  IFS=',' read -r -a raw_items <<< "$csv"
  for item in "${raw_items[@]}"; do
    item="$(trim "$item")"
    [ -z "$item" ] && continue
    out_ref+=("$item")
  done
}

contains() {
  local needle="$1"
  shift
  local candidate
  for candidate in "$@"; do
    if [ "$candidate" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

TS_SOCKET="${TS_SOCKET:-/alloc/tailscale/tailscaled.sock}"
TS_HOSTNAME="${TS_HOSTNAME:-gvfx-worker}"
TS_ACCEPT_ROUTES="${TS_ACCEPT_ROUTES:-true}"
TS_ACCEPT_DNS="${TS_ACCEPT_DNS:-false}"
TS_WAIT_SECONDS="${TS_WAIT_SECONDS:-60}"
TS_STATE_FILE="${TS_GUARD_STATE_FILE:-/alloc/tailscale/egress-selected}"
TS_EGRESS_CHECK_URLS="${TS_EGRESS_CHECK_URLS:-https://api.ipify.org,https://ifconfig.me/ip}"
TS_ADVERTISE_TAGS="${TS_ADVERTISE_TAGS:-tag:gvfx-app}"

require_var "TS_AUTHKEY"
require_var "TS_EXIT_NODE_PRIMARY"
require_var "TS_EGRESS_EXPECTED_IPS"

if ! command -v tailscale >/dev/null 2>&1; then
  fatal "tailscale CLI is not available"
fi

if ! command -v jq >/dev/null 2>&1; then
  fatal "jq is required for JSON parsing"
fi

split_csv "$TS_EXIT_NODE_FALLBACKS" fallback_nodes
split_csv "$TS_EGRESS_EXPECTED_IPS" expected_ips
split_csv "$TS_EGRESS_CHECK_URLS" ip_check_urls

if [ "${#expected_ips[@]}" -eq 0 ]; then
  fatal "TS_EGRESS_EXPECTED_IPS did not contain any IP values"
fi

if [ "${#ip_check_urls[@]}" -eq 0 ]; then
  fatal "TS_EGRESS_CHECK_URLS did not contain any URLs"
fi

ts() {
  tailscale --socket "$TS_SOCKET" "$@"
}

wait_for_tailscaled() {
  local elapsed=0
  while [ "$elapsed" -lt "$TS_WAIT_SECONDS" ]; do
    if ts status --json >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

fetch_public_ip() {
  local url
  local output

  for url in "${ip_check_urls[@]}"; do
    output=""
    if command -v curl >/dev/null 2>&1; then
      output="$(curl -fsS --max-time 10 "$url" 2>/dev/null || true)"
    elif command -v wget >/dev/null 2>&1; then
      output="$(wget -qO- --timeout=10 "$url" 2>/dev/null || true)"
    fi

    output="$(trim "$output")"
    if [ -n "$output" ]; then
      printf '%s' "$output"
      return 0
    fi
  done

  return 1
}

validate_egress_ip() {
  local observed_ip="$1"
  contains "$observed_ip" "${expected_ips[@]}"
}

up_with_exit_node() {
  local exit_node="$1"
  ts up \
    --authkey="$TS_AUTHKEY" \
    --hostname="$TS_HOSTNAME" \
    --advertise-tags="$TS_ADVERTISE_TAGS" \
    --accept-routes="$TS_ACCEPT_ROUTES" \
    --accept-dns="$TS_ACCEPT_DNS" \
    --exit-node="$exit_node" \
    --reset
}

validate_exit_status() {
  local status_json="$1"
  local online
  local exit_online
  local exit_id

  online="$(printf '%s' "$status_json" | jq -r '.Self.Online // false')"
  # Tailscale JSON uses top-level ExitNodeStatus on current releases.
  # Keep fallback to Self.ExitNodeStatus for compatibility with older layouts.
  exit_online="$(printf '%s' "$status_json" | jq -r '.ExitNodeStatus.Online // .Self.ExitNodeStatus.Online // false')"
  exit_id="$(printf '%s' "$status_json" | jq -r '.ExitNodeStatus.ID // .Self.ExitNodeStatus.ID // empty')"

  [ "$online" = "true" ] || return 1
  [ "$exit_online" = "true" ] || return 1
  [ -n "$exit_id" ] || return 1
  return 0
}

log "Waiting for tailscaled socket at $TS_SOCKET"
wait_for_tailscaled || fatal "tailscaled did not become ready within ${TS_WAIT_SECONDS}s"

nodes_to_try=("$TS_EXIT_NODE_PRIMARY")
for node in "${fallback_nodes[@]}"; do
  if ! contains "$node" "${nodes_to_try[@]}"; then
    nodes_to_try+=("$node")
  fi
done

if [ "${#nodes_to_try[@]}" -eq 0 ]; then
  fatal "No exit nodes were configured"
fi

for node in "${nodes_to_try[@]}"; do
  log "Attempting exit node: ${node}"

  if ! up_with_exit_node "$node" >/tmp/ts-up.log 2>&1; then
    log "Exit node ${node} rejected by tailscale up"
    continue
  fi

  sleep 2

  status_json="$(ts status --json 2>/dev/null || true)"
  if [ -z "$status_json" ] || ! validate_exit_status "$status_json"; then
    log "Exit node ${node} is not active after tailscale up"
    continue
  fi

  observed_ip="$(fetch_public_ip || true)"
  if [ -z "$observed_ip" ]; then
    log "Could not determine egress public IP for ${node}"
    continue
  fi

  if ! validate_egress_ip "$observed_ip"; then
    log "Observed egress IP ${observed_ip} is not in TS_EGRESS_EXPECTED_IPS"
    continue
  fi

  mkdir -p "$(dirname "$TS_STATE_FILE")"
  cat > "$TS_STATE_FILE" <<STATE
SELECTED_EXIT_NODE=${node}
OBSERVED_EGRESS_IP=${observed_ip}
VALIDATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
STATE

  log "Selected exit node ${node} with validated egress IP ${observed_ip}"
  exit 0
done

fatal "All configured exit nodes failed validation"
