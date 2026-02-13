#!/usr/bin/env bash
set -euo pipefail

: "${CANARY_CONVEX_DEPLOYMENT?Set CANARY_CONVEX_DEPLOYMENT before deploying}"

export CONVEX_DEPLOYMENT="${CANARY_CONVEX_DEPLOYMENT}"
echo "Deploying canary (${CONVEX_DEPLOYMENT})..."
npx convex deploy

echo "Run smoke checks against the canary deployment before promoting."
