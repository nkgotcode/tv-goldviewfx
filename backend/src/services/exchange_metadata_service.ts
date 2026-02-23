import { createHash } from "node:crypto";
import { fromBingxSymbol, resolveSupportedPair, toBingxSymbol } from "../config/market_catalog";
import { insertMarketInputSnapshot, listMarketInputSnapshots } from "../db/repositories/market_input_snapshots";
import { logWarn } from "./logger";
import type { TradingPair } from "../types/rl";

type ExchangeMetadataSnapshot = {
  kind: "exchange_metadata";
  pair: TradingPair;
  bingxSymbol: string;
  fetchedAt: string;
  expiresAt: string;
  source: "bingx_api" | "cache";
  contract: {
    priceStep: number;
    quantityStep: number;
    minQuantity: number;
    minNotional: number | null;
    pricePrecision: number;
    quantityPrecision: number;
  };
  fingerprint: string;
};

export type ExchangeInstrumentMetadata = {
  pair: TradingPair;
  bingxSymbol: string;
  priceStep: number;
  quantityStep: number;
  minQuantity: number;
  minNotional: number | null;
  pricePrecision: number;
  quantityPrecision: number;
  fetchedAt: string;
  expiresAt: string;
  source: "bingx_api" | "cache";
  fingerprint: string;
};

type GetMetadataOptions = {
  forceRefresh?: boolean;
  fetcher?: typeof fetch;
};

const DEFAULT_BASE_URL = "https://open-api.bingx.com";
const DEFAULT_TTL_SECONDS = 60 * 60;
const REQUEST_TIMEOUT_MS = 10_000;

const memoryCache = new Map<TradingPair, ExchangeInstrumentMetadata>();
const inflightRequests = new Map<TradingPair, Promise<ExchangeInstrumentMetadata>>();

function normalizeNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizePrecision(value: unknown) {
  const parsed = normalizeNumber(value);
  if (parsed === null) return null;
  const intValue = Math.trunc(parsed);
  if (!Number.isFinite(intValue) || intValue < 0 || intValue > 12) return null;
  return intValue;
}

function decimalPlaces(step: number) {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const serialized = step.toString();
  if (serialized.includes("e-")) {
    const exponent = Number.parseInt(serialized.split("e-")[1] ?? "0", 10);
    return Number.isFinite(exponent) ? exponent : 0;
  }
  const fraction = serialized.split(".")[1] ?? "";
  return fraction.length;
}

function canonicalStep(step: number, fallbackPrecision: number) {
  if (Number.isFinite(step) && step > 0) {
    return Number(step.toFixed(Math.min(decimalPlaces(step), 12)));
  }
  const precision = Math.max(0, Math.min(12, fallbackPrecision));
  return Number((1 / 10 ** precision).toFixed(precision));
}

function hashMetadata(input: {
  symbol: string;
  priceStep: number;
  quantityStep: number;
  minQuantity: number;
  minNotional: number | null;
  pricePrecision: number;
  quantityPrecision: number;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (!(key in record)) continue;
    const parsed = normalizeNumber(record[key]);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseRows(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;
  const data = body.data;
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (Array.isArray(record.contracts)) return record.contracts as Record<string, unknown>[];
    if (Array.isArray(record.symbols)) return record.symbols as Record<string, unknown>[];
    if (Array.isArray(record.rows)) return record.rows as Record<string, unknown>[];
    if (Array.isArray(record.list)) return record.list as Record<string, unknown>[];
    return [record];
  }
  if (Array.isArray(body.rows)) return body.rows as Record<string, unknown>[];
  if (Array.isArray(body.list)) return body.list as Record<string, unknown>[];
  return [];
}

function buildMetadataFromRow(pair: TradingPair, row: Record<string, unknown>, ttlSeconds: number): ExchangeInstrumentMetadata {
  const symbol = String(row.symbol ?? row.instrument ?? row.contractName ?? toBingxSymbol(pair));
  const now = new Date();
  const fetchedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  const explicitPricePrecision = normalizePrecision(
    row.pricePrecision ?? row.price_precision ?? row.priceScale ?? row.price_scale,
  );
  const explicitQuantityPrecision = normalizePrecision(
    row.quantityPrecision ?? row.quantity_precision ?? row.volumePrecision ?? row.qtyPrecision ?? row.qty_precision,
  );

  const rawPriceStep =
    firstNumber(row, ["tickSize", "priceStep", "price_step", "priceIncrement", "price_increment"]) ?? 0;
  const rawQuantityStep =
    firstNumber(row, ["stepSize", "lotSize", "quantityStep", "qtyStep", "qty_step", "sizeIncrement"]) ?? 0;
  const minQuantity =
    firstNumber(row, ["minQty", "min_qty", "minOrderQty", "min_order_qty", "minVolume", "min_volume"]) ??
    0;
  const minNotional = firstNumber(row, ["minNotional", "min_notional", "minTradeAmount", "min_trade_amount"]);

  const priceStep = canonicalStep(rawPriceStep, explicitPricePrecision ?? 2);
  const quantityStep = canonicalStep(rawQuantityStep, explicitQuantityPrecision ?? 3);
  const pricePrecision = explicitPricePrecision ?? decimalPlaces(priceStep);
  const quantityPrecision = explicitQuantityPrecision ?? decimalPlaces(quantityStep);
  const resolvedMinQuantity = minQuantity > 0 ? minQuantity : quantityStep;

  const fingerprint = hashMetadata({
    symbol,
    priceStep,
    quantityStep,
    minQuantity: resolvedMinQuantity,
    minNotional,
    pricePrecision,
    quantityPrecision,
  });

  return {
    pair,
    bingxSymbol: symbol,
    priceStep,
    quantityStep,
    minQuantity: resolvedMinQuantity,
    minNotional,
    pricePrecision,
    quantityPrecision,
    fetchedAt,
    expiresAt,
    source: "bingx_api",
    fingerprint,
  };
}

function toSnapshot(metadata: ExchangeInstrumentMetadata): ExchangeMetadataSnapshot {
  return {
    kind: "exchange_metadata",
    pair: metadata.pair,
    bingxSymbol: metadata.bingxSymbol,
    fetchedAt: metadata.fetchedAt,
    expiresAt: metadata.expiresAt,
    source: metadata.source,
    contract: {
      priceStep: metadata.priceStep,
      quantityStep: metadata.quantityStep,
      minQuantity: metadata.minQuantity,
      minNotional: metadata.minNotional,
      pricePrecision: metadata.pricePrecision,
      quantityPrecision: metadata.quantityPrecision,
    },
    fingerprint: metadata.fingerprint,
  };
}

function fromSnapshot(snapshot: ExchangeMetadataSnapshot): ExchangeInstrumentMetadata {
  return {
    pair: snapshot.pair,
    bingxSymbol: snapshot.bingxSymbol,
    priceStep: snapshot.contract.priceStep,
    quantityStep: snapshot.contract.quantityStep,
    minQuantity: snapshot.contract.minQuantity,
    minNotional: snapshot.contract.minNotional,
    pricePrecision: snapshot.contract.pricePrecision,
    quantityPrecision: snapshot.contract.quantityPrecision,
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
    source: "cache",
    fingerprint: snapshot.fingerprint,
  };
}

function isFresh(metadata: ExchangeInstrumentMetadata) {
  return Date.parse(metadata.expiresAt) > Date.now();
}

async function loadSnapshotFromStore(pair: TradingPair) {
  try {
    const rows = await listMarketInputSnapshots(pair);
    for (const row of rows) {
      const metadata = (row as { metadata?: unknown }).metadata;
      if (!metadata || typeof metadata !== "object") continue;
      const snapshot = metadata as Partial<ExchangeMetadataSnapshot>;
      if (snapshot.kind !== "exchange_metadata") continue;
      if (snapshot.pair && snapshot.pair !== pair) continue;
      if (!snapshot.contract || !snapshot.fetchedAt || !snapshot.expiresAt || !snapshot.bingxSymbol || !snapshot.fingerprint) {
        continue;
      }
      return fromSnapshot(snapshot as ExchangeMetadataSnapshot);
    }
  } catch (error) {
    logWarn("exchange_metadata.load_snapshot_failed", { pair, error: String(error) });
  }
  return null;
}

async function storeSnapshot(metadata: ExchangeInstrumentMetadata) {
  try {
    await insertMarketInputSnapshot({
      pair: metadata.pair,
      captured_at: metadata.fetchedAt,
      metadata: toSnapshot(metadata),
    });
  } catch (error) {
    logWarn("exchange_metadata.store_snapshot_failed", { pair: metadata.pair, error: String(error) });
  }
}

async function fetchRawMetadata(pair: TradingPair, fetcher: typeof fetch): Promise<Record<string, unknown>[]> {
  const baseUrl = process.env.BINGX_BASE_URL ?? DEFAULT_BASE_URL;
  const symbol = toBingxSymbol(pair);
  const endpoints = ["/openApi/swap/v2/quote/contracts", "/openApi/swap/v2/quote/contract"];

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const url = new URL(`${baseUrl}${endpoint}`);
      url.searchParams.set("symbol", symbol);
      const response = await fetcher(url.toString(), { method: "GET", signal: controller.signal });
      clearTimeout(timeoutId);

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok) {
        throw new Error(`status=${response.status}`);
      }
      const rows = parseRows(body);
      if (rows.length > 0) {
        return rows;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("BingX metadata endpoint returned no rows");
}

function selectRowForPair(pair: TradingPair, rows: Record<string, unknown>[]) {
  const target = toBingxSymbol(pair).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return (
    rows.find((row) => {
      const symbol = String(row.symbol ?? row.instrument ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      return symbol === target;
    }) ?? rows[0] ?? null
  );
}

async function fetchAndBuildMetadata(pair: TradingPair, fetcher: typeof fetch) {
  const ttlSeconds = Math.max(60, Number.parseInt(process.env.EXCHANGE_METADATA_TTL_SEC ?? "", 10) || DEFAULT_TTL_SECONDS);
  const rows = await fetchRawMetadata(pair, fetcher);
  const row = selectRowForPair(pair, rows);
  if (!row) {
    throw new Error(`No contract metadata for ${pair}`);
  }
  const metadata = buildMetadataFromRow(pair, row, ttlSeconds);
  memoryCache.set(pair, metadata);
  void storeSnapshot(metadata);
  return metadata;
}

export async function getExchangeMetadata(pair: TradingPair, options: GetMetadataOptions = {}) {
  const cached = memoryCache.get(pair);
  if (!options.forceRefresh && cached && isFresh(cached)) {
    return cached;
  }

  if (!options.forceRefresh) {
    const snapshot = await loadSnapshotFromStore(pair);
    if (snapshot) {
      memoryCache.set(pair, snapshot);
      if (isFresh(snapshot)) {
        return snapshot;
      }
    }
  }

  const pending = inflightRequests.get(pair);
  if (pending) {
    return pending;
  }

  const request = fetchAndBuildMetadata(pair, options.fetcher ?? fetch)
    .catch(async (error) => {
      const fallback = memoryCache.get(pair) ?? (await loadSnapshotFromStore(pair));
      if (fallback) {
        memoryCache.set(pair, fallback);
        return {
          ...fallback,
          source: "cache" as const,
        };
      }
      throw error;
    })
    .finally(() => {
      inflightRequests.delete(pair);
    });

  inflightRequests.set(pair, request);
  return request;
}

export async function getExchangeMetadataForInstrument(instrument: string, options: GetMetadataOptions = {}) {
  const pair = resolveSupportedPair(instrument) ?? fromBingxSymbol(instrument);
  if (!pair) {
    throw new Error(`Unsupported instrument for metadata lookup: ${instrument}`);
  }
  return getExchangeMetadata(pair as TradingPair, options);
}

export async function syncExchangeMetadata(pairs: TradingPair[], fetcher?: typeof fetch) {
  const results: ExchangeInstrumentMetadata[] = [];
  for (const pair of pairs) {
    const metadata = await getExchangeMetadata(pair, {
      forceRefresh: true,
      fetcher,
    });
    results.push(metadata);
  }
  return results;
}
