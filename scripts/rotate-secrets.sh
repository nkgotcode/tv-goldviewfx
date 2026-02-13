#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required to rotate secrets." >&2
  exit 1
fi

: "${CONVEX_DEPLOYMENT?Set CONVEX_DEPLOYMENT (e.g., from .env.local)}"
: "${BINGX_API_KEY?Set BINGX_API_KEY in the environment before rotating}"
: "${BINGX_SECRET_KEY?Set BINGX_SECRET_KEY in the environment before rotating}"

echo "Rotating BingX credentials for deployment: ${CONVEX_DEPLOYMENT}"
npx convex env set BINGX_API_KEY "${BINGX_API_KEY}"
npx convex env set BINGX_SECRET_KEY "${BINGX_SECRET_KEY}"

echo "Rotation complete."
