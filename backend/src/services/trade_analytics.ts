import { supabase } from "../db/client";

export type TradingSummary = {
  generated_at: string;
  trade_count: number;
  filled_count: number;
  win_rate: number;
  net_pnl: number;
  avg_pnl: number;
  max_drawdown: number;
  exposure_by_instrument: Record<string, number>;
};

export type TradingMetrics = {
  generated_at: string;
  series: Array<{ bucket: string; pnl: number; trade_count: number; win_rate: number }>;
};

export type PromotionMetrics = {
  tradeCount: number;
  winRate: number;
  netPnl: number;
  maxDrawdown: number;
};

function toBucket(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getTradingSummary(): Promise<TradingSummary> {
  const result = await supabase
    .from("trades")
    .select("id, instrument, pnl, position_size, quantity, status, created_at")
    .order("created_at", { ascending: true });

  const trades = result.data ?? [];
  const filled = trades.filter((trade) => trade.status === "filled");
  const pnlValues = filled.map((trade) => trade.pnl ?? 0);
  const netPnl = pnlValues.reduce((acc, value) => acc + value, 0);
  const wins = filled.filter((trade) => (trade.pnl ?? 0) > 0).length;
  const winRate = filled.length > 0 ? wins / filled.length : 0;

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of filled) {
    const pnl = trade.pnl ?? 0;
    cumulative += pnl;
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  const exposureByInstrument: Record<string, number> = {};
  for (const trade of filled) {
    const instrument = trade.instrument ?? "unknown";
    const size = trade.position_size ?? trade.quantity ?? 0;
    exposureByInstrument[instrument] = (exposureByInstrument[instrument] ?? 0) + size;
  }

  return {
    generated_at: new Date().toISOString(),
    trade_count: trades.length,
    filled_count: filled.length,
    win_rate: Number(winRate.toFixed(4)),
    net_pnl: Number(netPnl.toFixed(4)),
    avg_pnl: filled.length ? Number((netPnl / filled.length).toFixed(4)) : 0,
    max_drawdown: Number(maxDrawdown.toFixed(4)),
    exposure_by_instrument: exposureByInstrument,
  };
}

export async function getTradingMetrics(): Promise<TradingMetrics> {
  const result = await supabase
    .from("trades")
    .select("id, pnl, status, created_at")
    .order("created_at", { ascending: true });
  const trades = result.data ?? [];
  const buckets = new Map<string, { pnl: number; trades: number; wins: number }>();
  for (const trade of trades) {
    if (!trade.created_at) continue;
    const bucket = toBucket(new Date(trade.created_at));
    const current = buckets.get(bucket) ?? { pnl: 0, trades: 0, wins: 0 };
    const pnl = trade.status === "filled" ? trade.pnl ?? 0 : 0;
    current.pnl += pnl;
    if (trade.status === "filled") {
      current.trades += 1;
      if (pnl > 0) current.wins += 1;
    }
    buckets.set(bucket, current);
  }
  const series = [...buckets.entries()].map(([bucket, data]) => {
    const winRate = data.trades ? data.wins / data.trades : 0;
    return {
      bucket,
      pnl: Number(data.pnl.toFixed(4)),
      trade_count: data.trades,
      win_rate: Number(winRate.toFixed(4)),
    };
  });

  return { generated_at: new Date().toISOString(), series };
}

export async function getPromotionMetrics(): Promise<PromotionMetrics> {
  const result = await supabase
    .from("trades")
    .select("id, pnl, status, created_at")
    .eq("mode", "paper")
    .order("created_at", { ascending: true });
  const trades = result.data ?? [];
  const filled = trades.filter((trade) => trade.status === "filled");
  const netPnl = filled.reduce((acc, trade) => acc + (trade.pnl ?? 0), 0);
  const wins = filled.filter((trade) => (trade.pnl ?? 0) > 0).length;
  const winRate = filled.length ? wins / filled.length : 0;

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of filled) {
    const pnl = trade.pnl ?? 0;
    cumulative += pnl;
    if (cumulative > peak) peak = cumulative;
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    tradeCount: filled.length,
    winRate: Number(winRate.toFixed(4)),
    netPnl: Number(netPnl.toFixed(4)),
    maxDrawdown: Number(maxDrawdown.toFixed(4)),
  };
}
