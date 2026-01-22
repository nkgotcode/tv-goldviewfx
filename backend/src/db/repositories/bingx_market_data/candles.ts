import { supabase } from "../../client";
import { assertNoError } from "../base";

export type BingxCandleInsert = {
  pair: "Gold-USDT" | "XAUTUSDT" | "PAXGUSDT";
  interval: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume?: number | null;
  source?: string | null;
};

export async function upsertBingxCandles(rows: BingxCandleInsert[]) {
  if (rows.length === 0) return [];
  const result = await supabase
    .from("bingx_candles")
    .upsert(rows, { onConflict: "pair,interval,open_time" })
    .select("*");
  return assertNoError(result, "upsert bingx candles");
}

export async function getLatestCandleTime(pair: BingxCandleInsert["pair"], interval: string) {
  const result = await supabase
    .from("bingx_candles")
    .select("open_time")
    .eq("pair", pair)
    .eq("interval", interval)
    .order("open_time", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get latest candle time: ${result.error.message}`);
  }
  return result.data?.open_time ?? null;
}

export async function getEarliestCandleTime(pair: BingxCandleInsert["pair"], interval: string) {
  const result = await supabase
    .from("bingx_candles")
    .select("open_time")
    .eq("pair", pair)
    .eq("interval", interval)
    .order("open_time", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (result.error) {
    throw new Error(`get earliest candle time: ${result.error.message}`);
  }
  return result.data?.open_time ?? null;
}

export async function listBingxCandles(filters: {
  pair: BingxCandleInsert["pair"];
  interval: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  const query = supabase
    .from("bingx_candles")
    .select("*")
    .eq("pair", filters.pair)
    .eq("interval", filters.interval)
    .order("open_time", { ascending: true });
  if (filters.start) {
    query.gte("open_time", filters.start);
  }
  if (filters.end) {
    query.lte("open_time", filters.end);
  }
  if (filters.limit) {
    query.limit(filters.limit);
  }
  const result = await query;
  return assertNoError(result, "list bingx candles");
}

export async function listBingxCandleTimes(filters: {
  pair: BingxCandleInsert["pair"];
  interval: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  const pageSize = Math.min(filters.limit ?? 5000, 5000);
  let from = 0;
  const times: string[] = [];

  while (true) {
    const query = supabase
      .from("bingx_candles")
      .select("open_time")
      .eq("pair", filters.pair)
      .eq("interval", filters.interval)
      .order("open_time", { ascending: true })
      .range(from, from + pageSize - 1);
    if (filters.start) {
      query.gte("open_time", filters.start);
    }
    if (filters.end) {
      query.lte("open_time", filters.end);
    }
    const result = await query;
    const data = assertNoError(result, "list bingx candle times");
    for (const row of data) {
      if (row.open_time) {
        times.push(row.open_time);
      }
    }
    if (data.length < pageSize) {
      break;
    }
    from += pageSize;
    if (filters.limit && times.length >= filters.limit) {
      return times.slice(0, filters.limit);
    }
  }

  return times;
}
