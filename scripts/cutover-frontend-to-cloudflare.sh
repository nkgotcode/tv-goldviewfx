#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v nomad >/dev/null 2>&1; then
  echo "Missing required command: nomad" >&2
  exit 1
fi

"$ROOT_DIR/scripts/deploy-frontend-cloudflare.sh"

if [[ -n "${CLOUDFLARE_FRONTEND_URL:-}" ]]; then
  echo "Checking Cloudflare frontend URL: $CLOUDFLARE_FRONTEND_URL"
  curl -fsS --max-time 10 "$CLOUDFLARE_FRONTEND_URL" >/dev/null
fi

echo "Stopping Nomad frontend job..."
nomad job stop -purge gvfx-frontend

echo "Cutover complete: frontend served by Cloudflare, Nomad frontend stopped."
