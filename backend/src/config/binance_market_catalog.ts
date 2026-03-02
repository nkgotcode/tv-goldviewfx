/**
 * Binance Market Catalog
 *
 * Manages Binance trading pairs, symbol normalization, and exchange info caching.
 * Similar in concept to `market_catalog.ts` (BingX) but adapted for Binance's
 * format (no dashes in symbols, separate spot/futures base URLs).
 */

const DEFAULT_BINANCE_PAIRS = [
    "ALGOUSDT",
    "BNBUSDT",
    "BTCUSDT",
    "ETHUSDT",
    "PAXGUSDT",
    "SOLUSDT",
    "XRPUSDT",
];

const DEFAULT_BINANCE_INTERVALS = [
    "1m", "3m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "8h", "12h",
    "1d", "3d", "1w", "1M",
];

const SENTIMENT_PERIODS = ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"];

function parseCsv(value: string | undefined, fallback: string[]): string[] {
    if (!value || value.trim() === "") return [...fallback];
    const parsed = value.split(",").map((s) => s.trim()).filter(Boolean);
    return parsed.length > 0 ? [...new Set(parsed)] : [...fallback];
}

export function getBinancePairs(env: Record<string, string | undefined> = process.env): string[] {
    return parseCsv(env.BINANCE_MARKET_DATA_PAIRS, DEFAULT_BINANCE_PAIRS);
}

export function getBinanceIntervals(env: Record<string, string | undefined> = process.env): string[] {
    return parseCsv(env.BINANCE_INGEST_INTERVALS, DEFAULT_BINANCE_INTERVALS);
}

export function getBinanceSentimentPeriods(): string[] {
    return [...SENTIMENT_PERIODS];
}

/**
 * Normalize a pair string to Binance API format (uppercase, no dashes/special chars).
 * Examples: "ALGO-USDT" -> "ALGOUSDT", "btcusdt" -> "BTCUSDT"
 */
export function toBinanceSymbol(pair: string): string {
    return pair.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Convert Binance symbol back to our canonical pair format (same as symbol for Binance).
 * Binance uses "BTCUSDT" natively; we store as "BTCUSDT" too.
 */
export function fromBinanceSymbol(symbol: string): string {
    return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Convert a pair to lowercase WS stream format.
 * e.g. "BTCUSDT" -> "btcusdt"
 */
export function toWsStreamSymbol(pair: string): string {
    return toBinanceSymbol(pair).toLowerCase();
}

export type BinanceExchangeInfo = {
    symbols: Array<{
        symbol: string;
        status: string;
        baseAsset: string;
        quoteAsset: string;
        filters: unknown[];
        [key: string]: unknown;
    }>;
    [key: string]: unknown;
};

let spotExchangeInfoCache: { data: BinanceExchangeInfo; fetchedAt: number } | null = null;
let futuresExchangeInfoCache: { data: BinanceExchangeInfo; fetchedAt: number } | null = null;
const EXCHANGE_INFO_TTL_MS = 3600_000; // 1 hour

export async function fetchExchangeInfo(
    exchange: "spot" | "futures",
    fetcher: typeof fetch = fetch,
): Promise<BinanceExchangeInfo> {
    const cache = exchange === "spot" ? spotExchangeInfoCache : futuresExchangeInfoCache;
    if (cache && Date.now() - cache.fetchedAt < EXCHANGE_INFO_TTL_MS) {
        return cache.data;
    }

    const baseUrl = exchange === "spot"
        ? (process.env.BINANCE_SPOT_BASE_URL || "https://api.binance.com")
        : (process.env.BINANCE_FUTURES_BASE_URL || "https://fapi.binance.com");

    const path = exchange === "spot" ? "/api/v3/exchangeInfo" : "/fapi/v1/exchangeInfo";
    const response = await fetcher(`${baseUrl}${path}`);
    if (!response.ok) {
        throw new Error(`Binance exchangeInfo fetch failed (${exchange}): ${response.status}`);
    }
    const data = (await response.json()) as BinanceExchangeInfo;
    const entry = { data, fetchedAt: Date.now() };
    if (exchange === "spot") {
        spotExchangeInfoCache = entry;
    } else {
        futuresExchangeInfoCache = entry;
    }
    return data;
}

export const DEFAULT_BINANCE_PAIRS_LIST = [...DEFAULT_BINANCE_PAIRS];
export const DEFAULT_BINANCE_INTERVALS_LIST = [...DEFAULT_BINANCE_INTERVALS];
export const BINANCE_SENTIMENT_PERIODS = [...SENTIMENT_PERIODS];
