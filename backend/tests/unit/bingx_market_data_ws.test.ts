import { test, expect } from "bun:test";
import { buildBingxWsTopics, parseBingxWsMessage } from "../../src/services/bingx_market_data_ws";

test("builds BingX WS topics for pairs and intervals", () => {
  const topics = buildBingxWsTopics({
    pairs: ["Gold-USDT"],
    intervals: ["1m", "5m"],
    depthLevel: 5,
    depthSpeedMs: 500,
  });

  expect(topics).toEqual(
    expect.arrayContaining([
      "GOLD-USDT@trade",
      "GOLD-USDT@ticker",
      "GOLD-USDT@markPrice",
      "GOLD-USDT@depth5@500ms",
      "GOLD-USDT@kline_1m",
      "GOLD-USDT@kline_5m",
    ]),
  );
});

test("parses trade WS payloads", () => {
  const payload = JSON.stringify({
    code: 0,
    dataType: "XAUT-USDT@trade",
    data: { t: "trade-1", p: "2066.8", q: "0.35", m: true, T: 1700000000000 },
  });
  const events = parseBingxWsMessage(payload, new Map());
  expect(events).toHaveLength(1);
  const trade = events[0];
  if (trade.kind !== "trade") throw new Error("Expected trade event");
  expect(trade.pair).toBe("XAUTUSDT");
  expect(trade.side).toBe("sell");
  expect(trade.trade_id).toBe("trade-1");
});

test("parses kline WS payloads", () => {
  const intervalMs = new Map([["1m", 60_000]]);
  const payload = JSON.stringify({
    code: 0,
    dataType: "PAXG-USDT@kline_1m",
    data: [{ o: "1", h: "2", l: "0.5", c: "1.5", v: "100", T: 1700000060000 }],
  });
  const events = parseBingxWsMessage(payload, intervalMs);
  expect(events).toHaveLength(1);
  const kline = events[0];
  if (kline.kind !== "kline") throw new Error("Expected kline event");
  expect(kline.pair).toBe("PAXGUSDT");
  expect(kline.open_time).toBe(new Date(1700000000000).toISOString());
  expect(kline.close_time).toBe(new Date(1700000060000).toISOString());
});

test("parses depth WS payloads", () => {
  const payload = JSON.stringify({
    code: 0,
    dataType: "GOLD-USDT@depth5",
    data: { bids: [{ p: "1", a: "2" }], asks: [{ p: "1.1", a: "3" }], timestamp: 1700000000000 },
  });
  const events = parseBingxWsMessage(payload, new Map());
  expect(events).toHaveLength(1);
  const book = events[0];
  if (book.kind !== "orderbook") throw new Error("Expected orderbook event");
  expect(book.pair).toBe("Gold-USDT");
  expect(book.depth_level).toBe(5);
});

test("parses ticker WS payloads", () => {
  const payload = JSON.stringify({
    code: 0,
    dataType: "XAUT-USDT@ticker",
    data: { c: "2050.5", v: "500", p: "-1.2", E: 1700000000000 },
  });
  const events = parseBingxWsMessage(payload, new Map());
  expect(events).toHaveLength(1);
  const ticker = events[0];
  if (ticker.kind !== "ticker") throw new Error("Expected ticker event");
  expect(ticker.pair).toBe("XAUTUSDT");
  expect(ticker.last_price).toBeCloseTo(2050.5);
});

test("parses mark price WS payloads", () => {
  const payload = JSON.stringify({
    code: 0,
    dataType: "XAUT-USDT@markPrice",
    data: { p: "2060.0", E: 1700000000000 },
  });
  const events = parseBingxWsMessage(payload, new Map());
  expect(events).toHaveLength(1);
  const mark = events[0];
  if (mark.kind !== "markPrice") throw new Error("Expected mark price event");
  expect(mark.pair).toBe("XAUTUSDT");
  expect(mark.mark_price).toBeCloseTo(2060);
});
