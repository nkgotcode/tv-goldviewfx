import { getApiBaseUrl, getApiHeaders, type Trade } from "./api";

export type BingxCandle = {
  pair: string;
  interval: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: "no-store",
    headers: getApiHeaders(),
  });
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchBingxCandles(params: {
  pair: string;
  interval: string;
  start?: string;
  end?: string;
  limit?: number;
}) {
  const query = new URLSearchParams({
    pair: params.pair,
    interval: params.interval,
  });
  if (params.start) query.set("start", params.start);
  if (params.end) query.set("end", params.end);
  if (params.limit) query.set("limit", String(params.limit));
  const payload = await fetchJson<{ data: BingxCandle[] }>(`/bingx/market-data/candles?${query.toString()}`);
  return payload.data ?? [];
}

export async function fetchTradesForChart(params: {
  instrument: string;
  start?: string;
  end?: string;
  mode?: "paper" | "live";
  status?: string;
  pageSize?: number;
}) {
  const query = new URLSearchParams();
  query.set("instrument", params.instrument);
  if (params.start) query.set("start", params.start);
  if (params.end) query.set("end", params.end);
  if (params.mode) query.set("mode", params.mode);
  if (params.status) query.set("status", params.status);
  if (params.pageSize) query.set("page_size", String(params.pageSize));
  const payload = await fetchJson<{ data: Trade[] }>(`/trades?${query.toString()}`);
  return payload.data ?? [];
}
