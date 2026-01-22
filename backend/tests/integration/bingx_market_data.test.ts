import { test, expect } from "bun:test";
import { runBingxMarketDataIngest } from "../../src/services/bingx_market_data_ingest";
import { supabase } from "../../src/db/client";

const hasEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function mockFetchFactory(baseTime: number) {
  return async (input: RequestInfo | URL) => {
    const url = new URL(input.toString());
    let data: unknown = [];

    if (url.pathname.endsWith("/quote/klines")) {
      data = [
        [baseTime - 120_000, "2065.0", "2067.0", "2063.5", "2066.0", "120.4", baseTime - 60_000, "248000"],
        [baseTime - 60_000, "2066.0", "2068.0", "2065.2", "2067.4", "98.7", baseTime, "204000"],
      ];
    } else if (url.pathname.endsWith("/quote/depth")) {
      data = {
        bids: [
          ["2066.5", "1.2"],
          ["2066.3", "0.9"],
        ],
        asks: [
          ["2066.8", "1.1"],
          ["2067.0", "0.8"],
        ],
      };
    } else if (url.pathname.endsWith("/quote/trades")) {
      data = [
        { tradeId: "mock-trade-1", price: "2066.8", qty: "0.35", side: "BUY", time: baseTime - 90_000 },
        { tradeId: "mock-trade-2", price: "2066.2", qty: "0.28", side: "SELL", time: baseTime - 30_000 },
      ];
    } else if (url.pathname.endsWith("/quote/fundingRate")) {
      data = [{ fundingRate: "0.0004", fundingTime: baseTime - 28_800_000 }];
    } else if (url.pathname.endsWith("/quote/openInterest")) {
      data = [{ openInterest: "12345.6", time: baseTime - 300_000 }];
    } else if (url.pathname.endsWith("/quote/premiumIndex")) {
      data = [{ markPrice: "2066.9", indexPrice: "2066.5", time: baseTime - 240_000 }];
    } else if (url.pathname.endsWith("/quote/ticker")) {
      data = [{ lastPrice: "2066.8", volume24h: "50231.4", priceChange24h: "1.25", time: baseTime - 120_000 }];
    }

    return new Response(JSON.stringify({ code: 0, data }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

if (!hasEnv) {
  test.skip("bingx market data ingest requires Supabase configuration", () => {});
} else {
  test("ingests BingX market data and updates status", async () => {
    const baseTime = Date.parse("2026-01-12T00:00:00Z");
    const mockFetch = mockFetchFactory(baseTime);

    await supabase.from("bingx_trades").delete().eq("pair", "Gold-USDT");

    const summaries = await runBingxMarketDataIngest({
      pairs: ["Gold-USDT"],
      intervals: ["1m"],
      backfill: false,
      fetcher: mockFetch,
      now: new Date(baseTime),
    });

    expect(summaries[0]?.candlesInserted).toBeGreaterThan(0);
    expect(summaries[0]?.tradesInserted).toBeGreaterThan(0);

    const candles = await supabase
      .from("bingx_candles")
      .select("id")
      .eq("pair", "Gold-USDT")
      .eq("interval", "1m");
    expect(candles.data?.length ?? 0).toBeGreaterThan(0);

    const trades = await supabase.from("bingx_trades").select("trade_id").eq("trade_id", "mock-trade-1");
    expect(trades.data?.length ?? 0).toBe(1);

    const status = await supabase
      .from("data_source_status")
      .select("status")
      .eq("pair", "Gold-USDT")
      .eq("source_type", "bingx_candles")
      .single();
    expect(status.data?.status).toBe("ok");
  });
}
