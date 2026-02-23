import { z } from "zod";
import { isSupportedPair, resolveSupportedPair } from "./market_catalog";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  CONVEX_URL: z.string().url().optional(),
  TRADINGVIEW_PROFILE_URL: z.string().url().optional(),
  TRADINGVIEW_HTML_PATH: z.string().optional(),
  TRADINGVIEW_USE_HTML: booleanFromEnv.default(false),
  TRADINGVIEW_COOKIES_PATH: z.string().optional(),
  TRADINGVIEW_USE_BROWSER: booleanFromEnv.default(false),
  TRADINGVIEW_BROWSER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  TRADINGVIEW_SCROLL_PAGES: z.coerce.number().int().nonnegative().default(3),
  TRADINGVIEW_SCROLL_DELAY_MS: z.coerce.number().int().nonnegative().default(750),
  TRADINGVIEW_RECENT_DAYS: z.coerce.number().int().nonnegative().default(180),
  TRADINGVIEW_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  TRADINGVIEW_INCOMPLETE_RETRY_MAX: z.coerce.number().int().nonnegative().default(2),
  TRADINGVIEW_INCOMPLETE_RETRY_DELAY_MS: z.coerce.number().int().nonnegative().default(750),
  TRADINGVIEW_SYNC_INTERVAL_MIN: z.coerce.number().int().positive().default(60),
  SYNC_CONCURRENCY: z.coerce.number().int().positive().default(3),
  SYNC_DELAY_MS: z.coerce.number().int().nonnegative().default(0),
  FETCH_FULL: booleanFromEnv.default(true),
  INCLUDE_UPDATES: booleanFromEnv.default(false),
  INGESTION_DEFAULT_REFRESH_SECONDS: z.coerce.number().int().nonnegative().default(3600),
  INGESTION_DEFAULT_BACKOFF_BASE_SECONDS: z.coerce.number().int().nonnegative().default(300),
  INGESTION_DEFAULT_BACKOFF_MAX_SECONDS: z.coerce.number().int().nonnegative().default(3600),
  INGESTION_RUN_TIMEOUT_MIN: z.coerce.number().int().nonnegative().default(30),
  INGESTION_MIN_CONTENT_LENGTH: z.coerce.number().int().nonnegative().default(200),
  TELEGRAM_API_ID: z.coerce.number().int().positive().optional(),
  TELEGRAM_API_HASH: z.string().optional(),
  TELEGRAM_SESSION: z.string().optional(),
  TELEGRAM_CHAT_IDS: z.string().optional(),
  TELEGRAM_MESSAGES_PATH: z.string().optional(),
  TELEGRAM_SYNC_LIMIT: z.coerce.number().int().positive().default(50),
  TELEGRAM_INGEST_INTERVAL_MIN: z.coerce.number().int().positive().default(60),
  NEWS_FEED_URLS: z.string().optional(),
  NEWS_FEED_PATH: z.string().optional(),
  NEWS_SYNC_LIMIT: z.coerce.number().int().positive().default(50),
  OCR_PROVIDER: z.string().optional(),
  OCR_ENABLED: booleanFromEnv.default(false),
  OCR_MIN_CONFIDENCE: z.coerce.number().int().nonnegative().default(0),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  OPENROUTER_REFERER: z.string().optional(),
  OPENROUTER_TITLE: z.string().optional(),
  API_TOKEN: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8787),
  BINGX_API_KEY: z.string().optional(),
  BINGX_SECRET_KEY: z.string().optional(),
  BINGX_BASE_URL: z.string().url().optional(),
  BINGX_RECV_WINDOW: z.coerce.number().int().positive().default(5000),
  EXCHANGE_METADATA_TTL_SEC: z.coerce.number().int().positive().default(3600),
  TIMESCALE_MARKET_DATA_ENABLED: booleanFromEnv.default(false),
  TIMESCALE_RL_OPS_ENABLED: booleanFromEnv.default(false),
  TIMESCALE_URL: z.string().optional(),
  TIMESCALE_SCHEMA: z.string().default("public"),
  BINGX_MARKET_DATA_MOCK: booleanFromEnv.default(false),
  MARKET_GOLD_PAIRS: z.string().optional(),
  MARKET_CRYPTO_PAIRS: z.string().optional(),
  BINGX_MARKET_DATA_PAIRS: z.string().optional(),
  BINGX_MARKET_DATA_INTERVALS: z.string().optional(),
  BINGX_MARKET_DATA_INTERVAL_MIN: z.coerce.number().int().positive().default(1),
  BINGX_MARKET_DATA_BACKFILL: booleanFromEnv.default(true),
  BINGX_FULL_BACKFILL_ENABLED: booleanFromEnv.default(false),
  BINGX_FULL_BACKFILL_FORCE: booleanFromEnv.default(false),
  BINGX_FULL_BACKFILL_MAX_BATCHES: z.coerce.number().int().positive().default(10000),
  BINGX_FULL_BACKFILL_OPEN_GAP_THRESHOLD: z.coerce.number().int().nonnegative().default(1),
  BINGX_FULL_BACKFILL_NON_OK_SOURCE_THRESHOLD: z.coerce.number().int().nonnegative().default(1),
  BINGX_FULL_BACKFILL_ALERT_ENABLED: booleanFromEnv.default(true),
  BINGX_WS_ENABLED: booleanFromEnv.default(true),
  BINGX_WS_URL: z.string().url().optional(),
  BINGX_WS_DEPTH_LEVEL: z.coerce.number().int().positive().default(5),
  BINGX_WS_DEPTH_SPEED_MS: z.coerce.number().int().positive().optional(),
  BINGX_WS_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  BINGX_WS_RECONNECT_MIN_MS: z.coerce.number().int().positive().default(1000),
  BINGX_WS_RECONNECT_MAX_MS: z.coerce.number().int().positive().default(30000),
  BINGX_WS_SUBSCRIBE_BATCH_SIZE: z.coerce.number().int().positive().default(50),
  BINGX_WS_SUBSCRIBE_DELAY_MS: z.coerce.number().int().nonnegative().default(50),
  BINGX_WS_INCLUDE_BOOK_TICKER: booleanFromEnv.default(false),
  BINGX_WS_INCLUDE_LAST_PRICE: booleanFromEnv.default(false),
  BINGX_WS_INDEX_CACHE_MAX_AGE_MS: z.coerce.number().int().positive().default(300000),
  BINGX_WS_PAUSE_REST: booleanFromEnv.default(true),
  DATA_GAP_LOOKBACK_DAYS: z.coerce.number().int().positive().default(30),
  DATA_GAP_MAX_POINTS: z.coerce.number().int().positive().default(100000),
  DATA_GAP_MIN_MISSING_POINTS: z.coerce.number().int().nonnegative().default(1),
  DATA_GAP_MONITOR_INTERVAL_MIN: z.coerce.number().int().positive().default(15),
  DATA_GAP_HEAL_ENABLED: booleanFromEnv.default(true),
  DATA_GAP_HEAL_COOLDOWN_MIN: z.coerce.number().int().nonnegative().default(30),
  DATA_GAP_HEAL_MAX_GAPS_PER_RUN: z.coerce.number().int().positive().default(5),
  DATA_GAP_HEAL_MAX_BATCHES: z.coerce.number().int().positive().default(10),
  DATA_GAP_HEAL_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  TRADE_RECONCILE_INTERVAL_MIN: z.coerce.number().int().positive().default(5),
  DECISION_LATENCY_SLO_MS: z.coerce.number().int().positive().default(1500),
  INGESTION_LAG_SLO_SEC: z.coerce.number().int().positive().default(120),
  SLIPPAGE_SLO_BPS: z.coerce.number().int().positive().default(50),
  DRIFT_CONFIDENCE_BASELINE: z.coerce.number().min(0).max(1).default(0.5),
  DRIFT_CONFIDENCE_DELTA: z.coerce.number().min(0).max(1).default(0.3),
  RETRY_QUEUE_INTERVAL_SEC: z.coerce.number().int().positive().default(30),
  ALLOW_LIVE_SIMULATION: booleanFromEnv.default(false),
  DISABLE_TEST_DATA_IN_DB: booleanFromEnv.default(true),
  RL_ENFORCE_PROVENANCE: booleanFromEnv.default(false),
  RL_ONLINE_LEARNING_ENABLED: booleanFromEnv.default(false),
  RL_ONLINE_LEARNING_INTERVAL_MIN: z.coerce.number().int().positive().default(60),
  RL_ONLINE_LEARNING_INTERVAL: z.string().regex(/^\d+(m|h|d|w|M)$/).default("5m"),
  RL_ONLINE_LEARNING_CONTEXT_INTERVALS: z.string().optional(),
  RL_ONLINE_LEARNING_PAIRS: z.string().optional(),
  RL_ONLINE_LEARNING_PAIR: z
    .string()
    .default("XAUTUSDT")
    .transform((value) => resolveSupportedPair(value) ?? value)
    .refine((value) => isSupportedPair(value), "Unsupported RL_ONLINE_LEARNING_PAIR"),
  RL_ONLINE_LEARNING_TRAIN_WINDOW_MIN: z.coerce.number().int().positive().default(360),
  RL_ONLINE_LEARNING_EVAL_WINDOW_MIN: z.coerce.number().int().positive().default(120),
  RL_ONLINE_LEARNING_EVAL_LAG_MIN: z.coerce.number().int().nonnegative().default(1),
  RL_ONLINE_LEARNING_WINDOW_SIZE: z.coerce.number().int().positive().default(30),
  RL_ONLINE_LEARNING_STRIDE: z.coerce.number().int().positive().default(1),
  RL_ONLINE_LEARNING_TIMESTEPS: z.coerce.number().int().positive().default(500),
  RL_ONLINE_LEARNING_DECISION_THRESHOLD: z.coerce.number().positive().default(0.35),
  RL_ONLINE_LEARNING_AUTO_ROLL_FORWARD: booleanFromEnv.default(true),
  RL_ONLINE_LEARNING_MIN_WIN_RATE: z.coerce.number().min(0).max(1).default(0.55),
  RL_ONLINE_LEARNING_MIN_NET_PNL: z.coerce.number().default(0),
  RL_ONLINE_LEARNING_MAX_DRAWDOWN: z.coerce.number().min(0).max(1).default(0.25),
  RL_ONLINE_LEARNING_MIN_TRADE_COUNT: z.coerce.number().int().nonnegative().default(20),
  RL_ONLINE_LEARNING_MIN_WIN_RATE_DELTA: z.coerce.number().default(0),
  RL_ONLINE_LEARNING_MIN_NET_PNL_DELTA: z.coerce.number().default(0),
  RL_ONLINE_LEARNING_MAX_DRAWDOWN_DELTA: z.coerce.number().nonnegative().default(0.05),
  RL_ONLINE_LEARNING_MIN_TRADE_COUNT_DELTA: z.coerce.number().int().default(-5),
  RL_ONLINE_LEARNING_MIN_EFFECT_SIZE: z.coerce.number().nonnegative().default(0),
  RL_ONLINE_LEARNING_MIN_CONFIDENCE_Z: z.coerce.number().nonnegative().default(0),
  RL_ONLINE_LEARNING_MIN_SAMPLE_SIZE: z.coerce.number().int().nonnegative().default(0),
  RL_ONLINE_LEARNING_ROLLOUT_MODE: z.enum(["shadow", "canary", "full"]).default("canary"),
  RL_ONLINE_LEARNING_CANARY_MIN_TRADE_COUNT: z.coerce.number().int().nonnegative().default(25),
  RL_ONLINE_LEARNING_CANARY_MAX_DRAWDOWN: z.coerce.number().min(0).max(1).default(0.2),
  RL_PPO_LEVERAGE_DEFAULT: z.coerce.number().positive().default(3),
  RL_PPO_TAKER_FEE_BPS: z.coerce.number().nonnegative().default(4),
  RL_PPO_SLIPPAGE_BPS: z.coerce.number().nonnegative().default(1),
  RL_PPO_FUNDING_WEIGHT: z.coerce.number().nonnegative().default(1),
  RL_PPO_DRAWDOWN_PENALTY: z.coerce.number().nonnegative().default(0),
  RL_PPO_FEEDBACK_ROUNDS: z.coerce.number().int().nonnegative().default(1),
  RL_PPO_FEEDBACK_TIMESTEPS: z.coerce.number().int().positive().default(256),
  RL_PPO_FEEDBACK_HARD_RATIO: z.coerce.number().min(0).max(1).default(0.3),
  RL_FEATURE_OOD_ZSCORE_LIMIT: z.coerce.number().positive().default(6),
  RL_FEATURE_MAX_MISSING_CRITICAL: z.coerce.number().int().nonnegative().default(0),
  RL_FEATURE_MAX_FRESHNESS_SEC: z.coerce.number().int().positive().default(180),
  ACCOUNT_RISK_MIN_LIQUIDATION_BUFFER_BPS: z.coerce.number().nonnegative().default(50),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  const isProduction = nodeEnv === "production";
  const e2eEnabled = ["1", "true", "yes", "on"].includes((process.env.E2E_RUN ?? "").trim().toLowerCase());

  if (isProduction && !parsed.data.DISABLE_TEST_DATA_IN_DB) {
    throw new Error(
      "Invalid environment configuration: DISABLE_TEST_DATA_IN_DB must be true when NODE_ENV=production.",
    );
  }

  if (parsed.data.DISABLE_TEST_DATA_IN_DB || isProduction) {
    const blocked: string[] = [];
    if (e2eEnabled) blocked.push("E2E_RUN");
    if (parsed.data.BINGX_MARKET_DATA_MOCK) blocked.push("BINGX_MARKET_DATA_MOCK");
    if (parsed.data.TRADINGVIEW_USE_HTML || parsed.data.TRADINGVIEW_HTML_PATH) blocked.push("TRADINGVIEW fixture");
    if (parsed.data.TELEGRAM_MESSAGES_PATH) blocked.push("TELEGRAM_MESSAGES_PATH");
    if (blocked.length > 0) {
      throw new Error(
        `Invalid environment configuration: test/fixture sources disabled for DB writes (${blocked.join(", ")}).`,
      );
    }
  }
  return parsed.data;
}
