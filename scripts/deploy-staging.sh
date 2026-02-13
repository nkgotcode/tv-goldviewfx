#!/usr/bin/env bash
set -euo pipefail

: "${STAGING_CONVEX_DEPLOYMENT?Set STAGING_CONVEX_DEPLOYMENT before deploying}"

export CONVEX_DEPLOYMENT="${STAGING_CONVEX_DEPLOYMENT}"
echo "Deploying to staging (${CONVEX_DEPLOYMENT})..."
npx convex deploy
