import { test, expect } from "bun:test";
import { runBingxMarketDataIngest } from "../../src/services/bingx_market_data_ingest";
import { listDataSourceStatus } from "../../src/db/repositories/data_source_status";

const hasEnv = process.env.DB_TEST_ENABLED === "true";

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
  test.skip("bingx market data ingest requires database configuration", () => {});
} else {
  test("ingests BingX market data and updates status", async () => {
    const baseTime = Date.parse("2026-01-12T00:00:00Z");
    const mockFetch = mockFetchFactory(baseTime);
    const previousMock = process.env.BINGX_MARKET_DATA_MOCK;
    process.env.BINGX_MARKET_DATA_MOCK = "true";
    try {
      const summaries = await runBingxMarketDataIngest({
        pairs: ["Gold-USDT"],
        intervals: ["1m"],
        backfill: false,
        fetcher: mockFetch,
        now: new Date(baseTime),
        trigger: "manual",
      });

      expect(summaries[0]?.candlesInserted ?? 0).toBe(0);
      expect(summaries[0]?.tradesInserted ?? 0).toBe(0);

      const statuses = await listDataSourceStatus("Gold-USDT");
      const candleStatus = statuses.find((row) => row.source_type === "bingx_candles");
      expect(candleStatus?.status).toBe("ok");
    } finally {
      if (previousMock === undefined) {
        delete process.env.BINGX_MARKET_DATA_MOCK;
      } else {
        process.env.BINGX_MARKET_DATA_MOCK = previousMock;
      }
    }
  });
}
