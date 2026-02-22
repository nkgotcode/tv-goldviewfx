import { NextRequest, NextResponse } from "next/server";

type BingxKline = {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  time: number;
};

type BingxCandle = {
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

function normalizePairToken(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function toBingxSymbol(pair: string) {
  const normalized = normalizePairToken(pair);
  if (normalized === "GOLDUSDT" || normalized === "XAUTUSDT") return "XAUT-USDT";
  if (normalized === "PAXGUSDT") return "PAXG-USDT";

  const upper = pair.trim().toUpperCase();
  if (upper.includes("-")) return upper;
  if (upper.endsWith("USDT") && upper.length > 4) {
    return `${upper.slice(0, -4)}-USDT`;
  }
  return upper;
}

function mapKlineToCandle(pair: string, interval: string, kline: BingxKline): BingxCandle {
  const open = Number(kline.open);
  const high = Number(kline.high);
  const low = Number(kline.low);
  const close = Number(kline.close);
  const volume = Number(kline.volume);
  const openTimeMs = Number(kline.time);

  return {
    pair,
    interval,
    open_time: new Date(openTimeMs).toISOString(),
    close_time: new Date(openTimeMs).toISOString(),
    open: Number.isFinite(open) ? open : 0,
    high: Number.isFinite(high) ? high : 0,
    low: Number.isFinite(low) ? low : 0,
    close: Number.isFinite(close) ? close : 0,
    volume: Number.isFinite(volume) ? volume : 0,
  };
}

export async function GET(request: NextRequest) {
  const pair = request.nextUrl.searchParams.get("pair")?.trim() ?? "BTC-USDT";
  const interval = request.nextUrl.searchParams.get("interval")?.trim() ?? "1m";
  const limitRaw = request.nextUrl.searchParams.get("limit")?.trim() ?? "500";
  const parsedLimit = Number(limitRaw);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 1000) : 500;

  const query = new URLSearchParams({
    symbol: toBingxSymbol(pair),
    interval,
    limit: String(limit),
  });

  const response = await fetch(`https://open-api.bingx.com/openApi/swap/v3/quote/klines?${query.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json({ error: `BingX API error: ${response.status}` }, { status: response.status });
  }

  const payload = (await response.json()) as { code?: number; msg?: string; data?: BingxKline[] };
  if (payload.code !== 0 || !Array.isArray(payload.data)) {
    return NextResponse.json({ error: payload.msg ?? "Unexpected BingX response." }, { status: 502 });
  }

  return NextResponse.json({
    data: payload.data.map((row) => mapKlineToCandle(pair, interval, row)),
  });
}
