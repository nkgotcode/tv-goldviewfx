export type MarketSection = "gold" | "crypto";

export type MarketInstrument = {
  pair: string;
  bingxSymbol: string;
  section: MarketSection;
};

const DEFAULT_GOLD_PAIRS = ["XAUTUSDT", "PAXGUSDT"];
const DEFAULT_CRYPTO_PAIRS = ["ALGO-USDT", "BTC-USDT", "ETH-USDT", "SOL-USDT", "XRP-USDT", "BNB-USDT"];

function unique(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = normalizePairToken(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
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

export function normalizePairToken(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function getGoldPairs(env: Record<string, string | undefined> = process.env) {
  return parsePairsCsv(env.MARKET_GOLD_PAIRS, DEFAULT_GOLD_PAIRS);
}

export function getCryptoPairs(env: Record<string, string | undefined> = process.env) {
  return parsePairsCsv(env.MARKET_CRYPTO_PAIRS, DEFAULT_CRYPTO_PAIRS);
}

export function getSupportedPairs(env: Record<string, string | undefined> = process.env) {
  const explicit = env.BINGX_MARKET_DATA_PAIRS;
  if (explicit && explicit.trim() !== "") {
    return parsePairsCsv(explicit, [...DEFAULT_GOLD_PAIRS, ...DEFAULT_CRYPTO_PAIRS]);
  }
  return unique([...getGoldPairs(env), ...getCryptoPairs(env)]);
}

export function listPairsBySection(section: MarketSection, env: Record<string, string | undefined> = process.env) {
  return section === "gold" ? getGoldPairs(env) : getCryptoPairs(env);
}

export function resolveSupportedPair(pair: string, env: Record<string, string | undefined> = process.env) {
  let token = normalizePairToken(pair);
  if (token === "GOLDUSDT" || token === "GOLD") {
    token = "XAUTUSDT";
  }
  return getSupportedPairs(env).find((candidate) => normalizePairToken(candidate) === token) ?? null;
}

export function isSupportedPair(pair: string, env: Record<string, string | undefined> = process.env) {
  return resolveSupportedPair(pair, env) !== null;
}

export function toBingxSymbol(pair: string) {
  const normalized = normalizePairToken(pair);
  if (normalized === "GOLDUSDT" || normalized === "GOLD") return "XAUT-USDT";
  if (normalized === "XAUTUSDT") return "XAUT-USDT";
  if (normalized === "PAXGUSDT") return "PAXG-USDT";

  const upper = pair.trim().toUpperCase();
  if (upper.includes("-")) return upper;
  if (upper.endsWith("USDT") && upper.length > 4) {
    return `${upper.slice(0, -4)}-USDT`;
  }
  return upper;
}

export function fromBingxSymbol(symbol: string, env: Record<string, string | undefined> = process.env) {
  const target = normalizePairToken(symbol);
  return (
    getSupportedPairs(env).find((pair) => normalizePairToken(pair) === target) ??
    getSupportedPairs(env).find((pair) => normalizePairToken(toBingxSymbol(pair)) === target) ??
    null
  );
}

export function getPairSection(pair: string, env: Record<string, string | undefined> = process.env): MarketSection | null {
  const token = normalizePairToken(pair);
  if (getGoldPairs(env).some((candidate) => normalizePairToken(candidate) === token)) return "gold";
  if (getCryptoPairs(env).some((candidate) => normalizePairToken(candidate) === token)) return "crypto";
  return null;
}

export function listMarketInstruments(env: Record<string, string | undefined> = process.env): MarketInstrument[] {
  return getSupportedPairs(env)
    .map((pair) => {
      const section = getPairSection(pair, env);
      if (!section) return null;
      return {
        pair,
        bingxSymbol: toBingxSymbol(pair),
        section,
      } as MarketInstrument;
    })
    .filter((value): value is MarketInstrument => value !== null);
}

export const DEFAULT_MARKET_GOLD_PAIRS = [...DEFAULT_GOLD_PAIRS];
export const DEFAULT_MARKET_CRYPTO_PAIRS = [...DEFAULT_CRYPTO_PAIRS];
