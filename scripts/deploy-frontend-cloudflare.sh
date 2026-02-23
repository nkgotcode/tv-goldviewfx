#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
WORKER_NAME="${WORKER_NAME:-tv-goldviewfx-frontend}"
API_BASE_URL="${API_BASE_URL:-}"
API_TOKEN="${API_TOKEN:-}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

derive_nomad_api_base_url() {
  if ! command -v nomad >/dev/null 2>&1; then
    return 1
  fi
  local addr
  addr="$(nomad service info gvfx-api 2>/dev/null | awk 'NR==2 {print $2}' || true)"
  if [[ -z "$addr" ]]; then
    return 1
  fi
  printf "http://%s" "$addr"
}

derive_tailscale_funnel_base_url() {
  if ! command -v tailscale >/dev/null 2>&1; then
    return 1
  fi
  local url
  url="$(tailscale funnel status 2>/dev/null | awk '/^https:\/\// {print $1; exit}' || true)"
  if [[ -z "$url" ]]; then
    return 1
  fi
  printf "%s" "$url"
}

extract_url_host() {
  local url="$1"
  local no_scheme="${url#*://}"
  local host_port="${no_scheme%%/*}"
  printf "%s" "${host_port%%:*}"
}

is_private_host() {
  local host="$1"
  case "$host" in
    localhost|127.*|10.*|192.168.*)
      return 0
      ;;
  esac
  if [[ "$host" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]]; then
    return 0
  fi
  if [[ "$host" == *.local ]]; then
    return 0
  fi
  return 1
}

derive_nomad_api_token() {
  if ! command -v nomad >/dev/null 2>&1; then
    return 1
  fi

  local json token
  if command -v jq >/dev/null 2>&1; then
    json="$(nomad var get -out json nomad/jobs/gvfx/secrets 2>/dev/null || true)"
    token="$(printf "%s" "$json" | jq -r '.Items.API_TOKEN // empty' 2>/dev/null || true)"
  else
    token="$(nomad var get -out hcl nomad/jobs/gvfx/secrets 2>/dev/null | sed -n 's/^[[:space:]]*API_TOKEN = \"\\(.*\\)\"[[:space:]]*$/\\1/p' | head -n 1 || true)"
  fi

  if [[ -z "$token" ]]; then
    return 1
  fi
  printf "%s" "$token"
}

require_cmd bun
require_cmd npx

if [[ -z "$API_BASE_URL" ]]; then
  API_BASE_URL="$(derive_tailscale_funnel_base_url || true)"
fi

if [[ -z "$API_BASE_URL" ]]; then
  API_BASE_URL="$(derive_nomad_api_base_url || true)"
fi

if [[ -z "$API_BASE_URL" ]]; then
  cat >&2 <<'EOF'
API_BASE_URL is required.
Set it explicitly, for example:
  API_BASE_URL=https://api.your-domain.example ./scripts/deploy-frontend-cloudflare.sh
EOF
  exit 1
fi

API_HOST="$(extract_url_host "$API_BASE_URL")"
if is_private_host "$API_HOST"; then
  FUNNEL_BASE_URL="$(derive_tailscale_funnel_base_url || true)"
  if [[ -n "$FUNNEL_BASE_URL" ]]; then
    echo "Detected private API host ($API_HOST). Using public Tailscale Funnel URL instead: $FUNNEL_BASE_URL"
    API_BASE_URL="$FUNNEL_BASE_URL"
  else
    cat >&2 <<EOF
API_BASE_URL resolves to private host ($API_HOST), which Cloudflare Workers cannot use as an upstream.
Set API_BASE_URL to a public HTTPS host (or enable Tailscale Funnel) and rerun.
EOF
    exit 1
  fi
fi

if [[ -z "$API_TOKEN" ]]; then
  API_TOKEN="$(derive_nomad_api_token || true)"
fi

echo "Verifying Cloudflare auth..."
(cd "$FRONTEND_DIR" && npx wrangler whoami >/dev/null)

echo "Setting Cloudflare Worker secrets for $WORKER_NAME..."
printf "%s" "$API_BASE_URL" | (cd "$FRONTEND_DIR" && npx wrangler secret put API_BASE_URL --name "$WORKER_NAME")

if [[ -n "$API_TOKEN" ]]; then
  printf "%s" "$API_TOKEN" | (cd "$FRONTEND_DIR" && npx wrangler secret put API_TOKEN --name "$WORKER_NAME")
else
  echo "Warning: API_TOKEN not found. Protected backend routes may fail from Cloudflare frontend." >&2
fi

echo "Deploying frontend to Cloudflare Workers..."
(cd "$FRONTEND_DIR" && bun run deploy:cloudflare)

echo "Cloudflare frontend deployment complete."
