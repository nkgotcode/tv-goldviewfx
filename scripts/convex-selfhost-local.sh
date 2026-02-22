#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STACK_DIR="$ROOT_DIR/deploy/local/convex-selfhost"
COMPOSE_FILE="$STACK_DIR/docker-compose.yml"
ENV_FILE="$STACK_DIR/.env"
SELFHOST_ENV_FILE="$ROOT_DIR/.env.convex-selfhosted"
CONVEX_URL=""
DASHBOARD_URL=""

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    cp "$STACK_DIR/.env.example" "$ENV_FILE"
  fi

  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a

  CONVEX_URL="http://127.0.0.1:${CONVEX_PORT:-3210}"
  DASHBOARD_URL="http://127.0.0.1:${CONVEX_DASHBOARD_PORT:-6791}"
}

wait_for_url() {
  local url="$1"
  local retries="${2:-60}"
  local delay="${3:-2}"

  for _ in $(seq 1 "$retries"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

generate_admin_key() {
  compose exec -T convex-backend ./generate_admin_key.sh | tail -n 1 | tr -d '\r'
}

write_selfhost_env() {
  local key="$1"
  cat > "$SELFHOST_ENV_FILE" <<EOT
CONVEX_SELF_HOSTED_URL=$CONVEX_URL
CONVEX_SELF_HOSTED_ADMIN_KEY=$key
EOT
}

cmd_up() {
  ensure_env_file
  compose up -d

  if ! wait_for_url "$CONVEX_URL/version" 90 2; then
    echo "Convex backend did not become healthy at $CONVEX_URL/version" >&2
    exit 1
  fi

  if ! wait_for_url "$DASHBOARD_URL" 60 2; then
    echo "Convex dashboard did not become healthy at $DASHBOARD_URL" >&2
    exit 1
  fi

  echo "Local self-hosted Convex stack is up."
}

cmd_down() {
  ensure_env_file
  compose down
}

cmd_status() {
  ensure_env_file
  compose ps
}

cmd_logs() {
  ensure_env_file
  compose logs -f --tail=200
}

cmd_admin_key() {
  ensure_env_file
  generate_admin_key
}

cmd_setup_cli() {
  ensure_env_file

  if ! wait_for_url "$CONVEX_URL/version" 10 1; then
    echo "Convex backend is not healthy. Start it first with: $0 up" >&2
    exit 1
  fi

  local key
  key="$(generate_admin_key)"
  if [ -z "$key" ]; then
    echo "Failed to generate Convex self-hosted admin key" >&2
    exit 1
  fi

  write_selfhost_env "$key"
  echo "Wrote $SELFHOST_ENV_FILE"
}

cmd_push() {
  if [ ! -f "$SELFHOST_ENV_FILE" ]; then
    echo "Missing $SELFHOST_ENV_FILE. Run: $0 setup-cli" >&2
    exit 1
  fi

  (cd "$ROOT_DIR" && npx convex dev --once --env-file "$SELFHOST_ENV_FILE" --typecheck disable)
}

usage() {
  cat <<USAGE
Usage: $0 <command>

Commands:
  up         Start local Postgres + MinIO + Convex backend + dashboard
  down       Stop and remove local stack containers
  status     Show stack status
  logs       Tail stack logs
  admin-key  Print generated Convex self-hosted admin key
  setup-cli  Generate admin key and write .env.convex-selfhosted
  push       Push convex functions to local self-hosted backend
USAGE
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    up) cmd_up ;;
    down) cmd_down ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    admin-key) cmd_admin_key ;;
    setup-cli) cmd_setup_cli ;;
    push) cmd_push ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
