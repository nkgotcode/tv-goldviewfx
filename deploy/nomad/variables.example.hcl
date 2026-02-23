# Example Nomad variable payloads for tv-goldviewfx.
#
# Write these with:
#   nomad var put nomad/jobs/gvfx/config @deploy/nomad/variables.example.hcl
#   nomad var put nomad/jobs/gvfx/secrets @deploy/nomad/variables.example.hcl
#
# Keep secrets in a separate secure file in real environments.

MARKET_GOLD_PAIRS = "XAUTUSDT,PAXGUSDT"
MARKET_CRYPTO_PAIRS = "ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT"
BINGX_MARKET_DATA_PAIRS = "XAUTUSDT,PAXGUSDT,ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT"

BINGX_FULL_BACKFILL_ENABLED = "true"
BINGX_FULL_BACKFILL_FORCE = "false"
BINGX_FULL_BACKFILL_MAX_BATCHES = "10000"
BINGX_FULL_BACKFILL_OPEN_GAP_THRESHOLD = "1"
BINGX_FULL_BACKFILL_NON_OK_SOURCE_THRESHOLD = "1"
BINGX_FULL_BACKFILL_ALERT_ENABLED = "true"

NEXT_PUBLIC_MARKET_GOLD_PAIRS = "XAUTUSDT,PAXGUSDT"
NEXT_PUBLIC_MARKET_CRYPTO_PAIRS = "ALGO-USDT,BTC-USDT,ETH-USDT,SOL-USDT,XRP-USDT,BNB-USDT"
NEXT_PUBLIC_API_BASE_URL = "http://gvfx-api.service.nomad:8787"

RL_ONLINE_LEARNING_INTERVAL = "5m"
RL_ONLINE_LEARNING_CONTEXT_INTERVALS = "15m,1h,4h"
RL_ONLINE_LEARNING_PAIRS = "XAUTUSDT,PAXGUSDT,BTC-USDT,ETH-USDT,SOL-USDT,ALGO-USDT,XRP-USDT,BNB-USDT"
RL_ONLINE_LEARNING_DECISION_THRESHOLD = "0.35"

CONVEX_URL = "http://gvfx-convex.service.nomad:3210"
RL_SERVICE_URL = "http://gvfx-rl-service.service.nomad:9101"
TIMESCALE_MARKET_DATA_ENABLED = "true"

TS_EXIT_NODE_PRIMARY = "100.110.26.124"
TS_EXIT_NODE_FALLBACKS = ""
TS_EGRESS_EXPECTED_IPS = "203.0.113.10,203.0.113.11"
TS_HOSTNAME = "gvfx-worker"
TS_ADVERTISE_TAGS = "tag:gvfx-app"

# --- Secrets ---
# Place these into nomad/jobs/gvfx/secrets

API_TOKEN = "replace-me"
BINGX_API_KEY = "replace-me"
BINGX_SECRET_KEY = "replace-me"

TELEGRAM_API_ID = "replace-me"
TELEGRAM_API_HASH = "replace-me"
TELEGRAM_SESSION = "replace-me"

OPENAI_API_KEY = "replace-me"
OPENAI_BASE_URL = "https://openrouter.ai/api/v1"
OPENAI_MODEL = "google/gemini-3-flash-preview"
OPENROUTER_REFERER = "https://yourapp.example"
OPENROUTER_TITLE = "Goldviewfx Intelligence"
CORS_ORIGIN = "https://your-frontend-host.example"

TS_AUTHKEY = "tskey-auth-reusable-replace-me"

POSTGRES_DB = "convex"
POSTGRES_USER = "convex"
POSTGRES_PASSWORD = "replace-me"
TIMESCALE_URL = "postgres://user:password@pg-haproxy.service.nomad:5432/marketdata?sslmode=disable"

MINIO_ROOT_USER = "replace-me"
MINIO_ROOT_PASSWORD = "replace-me"

CONVEX_INSTANCE_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
CONVEX_EXPORTS_BUCKET = "convex-exports"
CONVEX_FILES_BUCKET = "convex-files"
CONVEX_MODULES_BUCKET = "convex-modules"
CONVEX_SEARCH_BUCKET = "convex-search"
CONVEX_SNAPSHOT_IMPORTS_BUCKET = "convex-snapshot-imports"
