/**
 * Binance REST API Client
 *
 * Handles both spot and futures endpoints with:
 * - HMAC-SHA256 signing for authenticated endpoints
 * - Rate limit tracking from X-MBX-USED-WEIGHT-1M headers
 * - Adaptive throttle when weight budget >80% consumed
 * - Retry + exponential backoff on 429/418
 */

import { createHmac } from "node:crypto";
import { logInfo, logWarn } from "../../services/logger";

export type BinanceClientConfig = {
    apiKey?: string;
    secretKey?: string;
    spotBaseUrl?: string;
    futuresBaseUrl?: string;
    fetcher?: typeof fetch;
};

type RateLimitState = {
    usedWeight: number;
    lastUpdated: number;
    limit: number;
};

const DEFAULT_SPOT_URL = "https://api.binance.com";
const DEFAULT_FUTURES_URL = "https://fapi.binance.com";
const WEIGHT_BUDGET_WARN = 0.8;
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

export class BinanceClient {
    private readonly apiKey: string;
    private readonly secretKey: string;
    private readonly spotBaseUrl: string;
    private readonly futuresBaseUrl: string;
    private readonly fetcher: typeof fetch;
    private spotWeight: RateLimitState = { usedWeight: 0, lastUpdated: 0, limit: 1200 };
    private futuresWeight: RateLimitState = { usedWeight: 0, lastUpdated: 0, limit: 2400 };

    constructor(config: BinanceClientConfig = {}) {
        this.apiKey = config.apiKey ?? process.env.BINANCE_API_KEY ?? "";
        this.secretKey = config.secretKey ?? process.env.BINANCE_SECRET_KEY ?? "";
        this.spotBaseUrl = config.spotBaseUrl ?? process.env.BINANCE_SPOT_BASE_URL ?? DEFAULT_SPOT_URL;
        this.futuresBaseUrl = config.futuresBaseUrl ?? process.env.BINANCE_FUTURES_BASE_URL ?? DEFAULT_FUTURES_URL;
        this.fetcher = config.fetcher ?? fetch;
    }

    // ─── Spot endpoints ───

    async getSpotKlines(params: { symbol: string; interval: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.spotGet<unknown[]>("/api/v3/klines", params as Record<string, string | number>);
    }

    async getSpotAggTrades(params: { symbol: string; fromId?: number; startTime?: number; endTime?: number; limit?: number }) {
        return this.spotGet<unknown[]>("/api/v3/aggTrades", params as Record<string, string | number>);
    }

    async getSpotDepth(params: { symbol: string; limit?: number }) {
        return this.spotGet<{ bids: unknown[]; asks: unknown[] }>("/api/v3/depth", params as Record<string, string | number>);
    }

    async getSpotTicker24hr(params: { symbol: string }) {
        return this.spotGet<Record<string, unknown>>("/api/v3/ticker/24hr", params as Record<string, string | number>);
    }

    async getSpotExchangeInfo() {
        return this.spotGet<Record<string, unknown>>("/api/v3/exchangeInfo", {});
    }

    // ─── Futures endpoints ───

    async getFuturesKlines(params: { symbol: string; interval: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/fapi/v1/klines", params as Record<string, string | number>);
    }

    async getFuturesAggTrades(params: { symbol: string; fromId?: number; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/fapi/v1/aggTrades", params as Record<string, string | number>);
    }

    async getFuturesDepth(params: { symbol: string; limit?: number }) {
        return this.futuresGet<{ bids: unknown[]; asks: unknown[] }>("/fapi/v1/depth", params as Record<string, string | number>);
    }

    async getFuturesTicker24hr(params: { symbol: string }) {
        return this.futuresGet<Record<string, unknown>>("/fapi/v1/ticker/24hr", params as Record<string, string | number>);
    }

    async getFuturesExchangeInfo() {
        return this.futuresGet<Record<string, unknown>>("/fapi/v1/exchangeInfo", {});
    }

    async getFundingRate(params: { symbol: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/fapi/v1/fundingRate", params as Record<string, string | number>);
    }

    async getOpenInterest(params: { symbol: string }) {
        return this.futuresGet<Record<string, unknown>>("/fapi/v1/openInterest", params as Record<string, string | number>);
    }

    async getOiStatistics(params: { symbol: string; period: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/futures/data/openInterestHist", params as Record<string, string | number>);
    }

    async getMarkPriceKlines(params: { symbol: string; interval: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/fapi/v1/markPriceKlines", params as Record<string, string | number>);
    }

    async getIndexPriceKlines(params: { pair: string; interval: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/fapi/v1/indexPriceKlines", params as Record<string, string | number>);
    }

    async getPremiumIndexKlines(params: { symbol: string; interval: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/fapi/v1/premiumIndexKlines", params as Record<string, string | number>);
    }

    async getTopLongShortPositionRatio(params: { symbol: string; period: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/futures/data/topLongShortPositionRatio", params as Record<string, string | number>);
    }

    async getTopLongShortAccountRatio(params: { symbol: string; period: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/futures/data/topLongShortAccountRatio", params as Record<string, string | number>);
    }

    async getGlobalLongShortRatio(params: { symbol: string; period: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/futures/data/globalLongShortAccountRatio", params as Record<string, string | number>);
    }

    async getTakerBuySellVolume(params: { symbol: string; period: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/futures/data/takerlongshortRatio", params as Record<string, string | number>);
    }

    async getBasis(params: { pair: string; contractType?: string; period: string; startTime?: number; endTime?: number; limit?: number }) {
        return this.futuresGet<unknown[]>("/futures/data/basis", params as Record<string, string | number>);
    }

    // ─── Core request helpers ───

    private async spotGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
        return this.request<T>(this.spotBaseUrl, path, params, "spot");
    }

    private async futuresGet<T>(path: string, params: Record<string, string | number>): Promise<T> {
        return this.request<T>(this.futuresBaseUrl, path, params, "futures");
    }

    private async request<T>(
        baseUrl: string,
        path: string,
        params: Record<string, string | number | undefined>,
        exchange: "spot" | "futures",
    ): Promise<T> {
        // Adaptive throttle: if weight > 80%, sleep proportionally
        const state = exchange === "spot" ? this.spotWeight : this.futuresWeight;
        const ratio = state.usedWeight / state.limit;
        if (ratio > WEIGHT_BUDGET_WARN) {
            const sleepMs = Math.min(30000, Math.round((ratio - WEIGHT_BUDGET_WARN) * 60000));
            logWarn("Binance rate limit approaching", { exchange, usedWeight: state.usedWeight, limit: state.limit, sleepMs });
            await sleep(sleepMs);
        }

        // Build query string — filter out undefined values
        const cleanParams: Record<string, string> = {};
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                cleanParams[key] = String(value);
            }
        }

        const queryString = new URLSearchParams(cleanParams).toString();
        const url = queryString ? `${baseUrl}${path}?${queryString}` : `${baseUrl}${path}`;

        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const headers: Record<string, string> = {};
                if (this.apiKey) {
                    headers["X-MBX-APIKEY"] = this.apiKey;
                }

                const response = await this.fetcher(url, { method: "GET", headers });

                // Track rate limit weight
                const weightHeader = response.headers.get("X-MBX-USED-WEIGHT-1M")
                    ?? response.headers.get("x-mbx-used-weight-1m");
                if (weightHeader) {
                    const weight = Number.parseInt(weightHeader, 10);
                    if (Number.isFinite(weight)) {
                        state.usedWeight = weight;
                        state.lastUpdated = Date.now();
                    }
                }

                if (response.status === 429 || response.status === 418) {
                    const retryAfter = response.headers.get("Retry-After");
                    const backoffMs = retryAfter
                        ? Number.parseInt(retryAfter, 10) * 1000
                        : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                    logWarn("Binance rate limited", { status: response.status, attempt, backoffMs });
                    await sleep(backoffMs);
                    continue;
                }

                if (!response.ok) {
                    const body = await response.text();
                    throw new Error(`Binance API error (${response.status}): ${body}`);
                }

                return (await response.json()) as T;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                if (attempt < MAX_RETRIES) {
                    const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                    await sleep(backoffMs);
                }
            }
        }

        throw lastError ?? new Error("Binance request failed after retries");
    }

    /** Sign a request with HMAC-SHA256 (for authenticated endpoints, not used yet for market data) */
    signQuery(params: Record<string, string | number>): string {
        const timestamp = Date.now();
        const withTimestamp = { ...params, timestamp };
        const queryString = new URLSearchParams(
            Object.entries(withTimestamp).map(([k, v]) => [k, String(v)]),
        ).toString();
        const signature = createHmac("sha256", this.secretKey).update(queryString).digest("hex");
        return `${queryString}&signature=${signature}`;
    }

    getWeightStatus() {
        return {
            spot: { ...this.spotWeight },
            futures: { ...this.futuresWeight },
        };
    }
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
