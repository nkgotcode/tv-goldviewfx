#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEED_FILE="$ROOT_DIR/supabase/seed.sql"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install it before running this script." >&2
  exit 1
fi

supabase start
supabase db reset --local

if [ ! -f "$SEED_FILE" ]; then
  echo "Missing seed file: $SEED_FILE" >&2
  exit 1
fi

echo "Local Supabase ready with RL test seeds."
