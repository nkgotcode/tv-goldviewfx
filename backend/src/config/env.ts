import { z } from "zod";

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
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
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
  BINGX_MARKET_DATA_MOCK: booleanFromEnv.default(false),
  BINGX_MARKET_DATA_INTERVALS: z.string().optional(),
  BINGX_MARKET_DATA_INTERVAL_MIN: z.coerce.number().int().positive().default(1),
  BINGX_MARKET_DATA_BACKFILL: booleanFromEnv.default(true),
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
  ALLOW_LIVE_SIMULATION: booleanFromEnv.default(false),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }
  return parsed.data;
}
