/**
 * Raw data lake: store exactly what the exchange returns (REST JSON, WS frames).
 * Partition: {venue}/{endpoint}/{YYYY}/{MM}/{DD}/...
 * Uses filesystem when DATA_LAKE_RAW_ENABLED=true and DATA_LAKE_RAW_PATH is set.
 * Compatible with S3-style layout for future object-store backend.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logWarn } from "../logger";

const RAW_LAKE_ENABLED =
  process.env.DATA_LAKE_RAW_ENABLED &&
  ["1", "true", "yes", "on"].includes(process.env.DATA_LAKE_RAW_ENABLED.trim().toLowerCase());
const RAW_LAKE_PATH = process.env.DATA_LAKE_RAW_PATH?.trim() || "";

export function isRawLakeEnabled(): boolean {
  return Boolean(RAW_LAKE_ENABLED && RAW_LAKE_PATH);
}

/**
 * Build partition path: venue/endpoint/YYYY/MM/DD
 */
export function rawLakePartition(venue: string, endpoint: string, date: Date): string {
  const YYYY = date.getUTCFullYear();
  const MM = String(date.getUTCMonth() + 1).padStart(2, "0");
  const DD = String(date.getUTCDate()).padStart(2, "0");
  return join(venue, endpoint, String(YYYY), MM, DD);
}

/**
 * Write a single raw payload (immutable). Filename includes timestamp and a short id to avoid collisions.
 */
export async function writeRawPayload(
  venue: string,
  endpoint: string,
  payload: unknown,
  options: { date?: Date; suffix?: string } = {}
): Promise<string | null> {
  if (!isRawLakeEnabled()) return null;
  const date = options.date ?? new Date();
  const partition = rawLakePartition(venue, endpoint, date);
  const dir = join(RAW_LAKE_PATH, partition);
  const ts = date.getTime();
  const suffix = options.suffix ?? "payload";
  const filename = `${ts}_${suffix}.json`;
  const filepath = join(dir, filename);

  try {
    await mkdir(dir, { recursive: true });
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    await writeFile(filepath, body, "utf8");
    return filepath;
  } catch (error) {
    logWarn("Raw lake write failed", {
      venue,
      endpoint,
      filepath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Endpoint names for BingX (for partition layout).
 */
export const BINGX_ENDPOINTS = {
  REST_CANDLES: "rest/kline",
  REST_TRADES: "rest/trades",
  REST_FUNDING: "rest/fundingRate",
  REST_ORDERBOOK: "rest/depth",
  REST_TICKER: "rest/ticker",
  WS_CANDLES: "ws/kline",
  WS_TRADES: "ws/trades",
  WS_ORDERBOOK: "ws/depth",
  WS_TICKER: "ws/ticker",
} as const;
