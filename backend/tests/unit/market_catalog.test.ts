import { expect, test } from "bun:test";
import {
  fromBingxSymbol,
  getSupportedPairs,
  listPairsBySection,
  resolveSupportedPair,
  toBingxSymbol,
} from "../../src/config/market_catalog";

test("default supported pairs include gold and crypto lanes", () => {
  const pairs = getSupportedPairs({});
  expect(pairs).toEqual(
    expect.arrayContaining([
      "Gold-USDT",
      "XAUTUSDT",
      "PAXGUSDT",
      "ALGO-USDT",
      "BTC-USDT",
      "ETH-USDT",
      "SOL-USDT",
      "XRP-USDT",
      "BNB-USDT",
    ]),
  );
});

test("resolveSupportedPair normalizes separators and case", () => {
  const env = {
    MARKET_GOLD_PAIRS: "Gold-USDT,XAUTUSDT,PAXGUSDT",
    MARKET_CRYPTO_PAIRS: "ALGO-USDT,BTC-USDT",
  };
  expect(resolveSupportedPair("algo_usdt", env)).toBe("ALGO-USDT");
  expect(resolveSupportedPair("btcusdt", env)).toBe("BTC-USDT");
  expect(resolveSupportedPair("xaut-usdt", env)).toBe("XAUTUSDT");
});

test("bingx symbol mapping round-trip works for gold aliases and crypto symbols", () => {
  const env = {
    MARKET_GOLD_PAIRS: "Gold-USDT,XAUTUSDT,PAXGUSDT",
    MARKET_CRYPTO_PAIRS: "ALGO-USDT,BTC-USDT",
  };
  expect(toBingxSymbol("Gold-USDT")).toBe("XAUT-USDT");
  expect(toBingxSymbol("XAUTUSDT")).toBe("XAUT-USDT");
  expect(fromBingxSymbol("XAUT-USDT", env)).toBe("XAUTUSDT");
  expect(toBingxSymbol("ALGO-USDT")).toBe("ALGO-USDT");
  expect(fromBingxSymbol("ALGO-USDT", env)).toBe("ALGO-USDT");
});

test("section lists follow env overrides", () => {
  const env = {
    MARKET_GOLD_PAIRS: "Gold-USDT",
    MARKET_CRYPTO_PAIRS: "BTC-USDT,ETH-USDT",
  };
  expect(listPairsBySection("gold", env)).toEqual(["Gold-USDT"]);
  expect(listPairsBySection("crypto", env)).toEqual(["BTC-USDT", "ETH-USDT"]);
});
