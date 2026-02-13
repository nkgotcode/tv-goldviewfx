#!/usr/bin/env bash
set -euo pipefail

: "${TARGET_CONVEX_DEPLOYMENT?Set TARGET_CONVEX_DEPLOYMENT before rollback}"
: "${ROLLBACK_REF?Set ROLLBACK_REF to a git tag/sha to deploy}"

echo "Rolling back deployment ${TARGET_CONVEX_DEPLOYMENT} to ${ROLLBACK_REF}"
echo "Create a clean worktree and deploy:"
echo "  git worktree add /tmp/tv-goldviewfx-rollback ${ROLLBACK_REF}"
echo "  cd /tmp/tv-goldviewfx-rollback"
echo "  CONVEX_DEPLOYMENT=${TARGET_CONVEX_DEPLOYMENT} npx convex deploy"
