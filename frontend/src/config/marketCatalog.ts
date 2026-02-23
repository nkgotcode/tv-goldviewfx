export type MarketSection = "gold" | "crypto";

const DEFAULT_GOLD_PAIRS = ["XAUTUSDT", "PAXGUSDT"];
const DEFAULT_CRYPTO_PAIRS = ["ALGO-USDT", "BTC-USDT", "ETH-USDT", "SOL-USDT", "XRP-USDT", "BNB-USDT"];

function normalizePairToken(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const token = normalizePairToken(trimmed);
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(trimmed);
  }
  return output;
}

function parsePairsCsv(value: string | undefined, fallback: string[]) {
  if (!value || value.trim() === "") {
    return [...fallback];
  }
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? unique(parsed) : [...fallback];
}

export const GOLD_PAIRS = parsePairsCsv(process.env.NEXT_PUBLIC_MARKET_GOLD_PAIRS, DEFAULT_GOLD_PAIRS);
export const CRYPTO_PAIRS = parsePairsCsv(process.env.NEXT_PUBLIC_MARKET_CRYPTO_PAIRS, DEFAULT_CRYPTO_PAIRS);
export const ALL_PAIRS = unique([...GOLD_PAIRS, ...CRYPTO_PAIRS]);

export const MARKET_SYMBOL_INFO: Record<string, { pricePrecision: number; volumePrecision: number }> = {
  "Gold-USDT": { pricePrecision: 2, volumePrecision: 3 },
  XAUTUSDT: { pricePrecision: 2, volumePrecision: 3 },
  PAXGUSDT: { pricePrecision: 2, volumePrecision: 3 },
  "ALGO-USDT": { pricePrecision: 4, volumePrecision: 1 },
  "BTC-USDT": { pricePrecision: 2, volumePrecision: 4 },
  "ETH-USDT": { pricePrecision: 2, volumePrecision: 3 },
  "SOL-USDT": { pricePrecision: 3, volumePrecision: 1 },
  "XRP-USDT": { pricePrecision: 4, volumePrecision: 1 },
  "BNB-USDT": { pricePrecision: 2, volumePrecision: 2 },
};

export function isKnownPair(pair: string) {
  const token = normalizePairToken(pair);
  return ALL_PAIRS.some((candidate) => normalizePairToken(candidate) === token);
}

export function listPairsBySection(section: MarketSection) {
  return section === "gold" ? GOLD_PAIRS : CRYPTO_PAIRS;
}
