import { listBingxCandleTimes, listBingxCandles } from "../db/repositories/bingx_market_data/candles";
import { listRlFeatureSnapshots, upsertRlFeatureSnapshots } from "../db/repositories/rl_feature_snapshots";
import { getFeatureSchemaFingerprint, getFeatureSetConfigById, type FeatureSetConfig } from "./feature_set_service";
import { logWarn } from "./logger";

type Candle = {
  open_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type FeatureSnapshotQuery = {
  pair: string;
  interval: string;
  startAt: string;
  endAt: string;
  featureSetVersionId: string;
};

type IndicatorDef = {
  name: string;
  params: Record<string, number>;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIndicatorConfig(config: FeatureSetConfig): IndicatorDef[] {
  const indicators = config.technical?.enabled ? config.technical.indicators ?? [] : [];
  return indicators
    .map((indicator) => ({
      name: String(indicator.name ?? "").toLowerCase(),
      params: Object.fromEntries(
        Object.entries(indicator.params ?? {}).map(([key, value]) => [key.toLowerCase(), toNumber(value)]),
      ),
    }))
    .filter((indicator) => indicator.name.length > 0);
}

function maxLookback(indicators: IndicatorDef[]) {
  return indicators.reduce((max, indicator) => {
    const values = Object.values(indicator.params);
    const candidate = values.length > 0 ? Math.max(...values) : 0;
    return Math.max(max, Number.isFinite(candidate) ? candidate : 0);
  }, 34);
}

function avg(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values: number[]) {
  if (values.length < 2) return 0;
  const mean = avg(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function sliceFrom<T>(values: T[], index: number, count: number) {
  if (count <= 0) return [];
  const start = Math.max(0, index - count + 1);
  return values.slice(start, index + 1);
}

function calcEma(values: number[], period: number, index: number) {
  if (period <= 1) return values[index] ?? 0;
  const alpha = 2 / (period + 1);
  const window = sliceFrom(values, index, Math.max(period * 4, period));
  if (window.length === 0) return 0;
  let ema = window[0];
  for (let idx = 1; idx < window.length; idx += 1) {
    ema = alpha * window[idx] + (1 - alpha) * ema;
  }
  return ema;
}

function calcRsi(values: number[], period: number, index: number) {
  const window = sliceFrom(values, index, period + 1);
  if (window.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let idx = 1; idx < window.length; idx += 1) {
    const delta = window[idx] - window[idx - 1];
    if (delta >= 0) gains += delta;
    else losses += Math.abs(delta);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcAtr(highs: number[], lows: number[], closes: number[], period: number, index: number) {
  if (index <= 0) return null;
  const start = Math.max(1, index - period + 1);
  const trs: number[] = [];
  for (let idx = start; idx <= index; idx += 1) {
    const prevClose = closes[idx - 1] ?? closes[idx];
    const tr = Math.max(
      highs[idx] - lows[idx],
      Math.abs(highs[idx] - prevClose),
      Math.abs(lows[idx] - prevClose),
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  return avg(trs);
}

function calcMacd(closes: number[], index: number, fast: number, slow: number, signal: number) {
  if (index + 1 < slow + signal) return null;
  const macdSeries: number[] = [];
  for (let idx = 0; idx <= index; idx += 1) {
    macdSeries.push(calcEma(closes, fast, idx) - calcEma(closes, slow, idx));
  }
  const macd = macdSeries[macdSeries.length - 1] ?? 0;
  const signalValue = calcEma(macdSeries, signal, macdSeries.length - 1);
  return {
    macd,
    signal: signalValue,
    hist: macd - signalValue,
  };
}

function calcBbands(closes: number[], index: number, period: number, dev: number) {
  const window = sliceFrom(closes, index, period);
  if (window.length < period) return null;
  const middle = avg(window);
  const sigma = std(window);
  return {
    upper: middle + dev * sigma,
    middle,
    lower: middle - dev * sigma,
  };
}

function computeIndicatorFeatures(indicators: IndicatorDef[], candles: Candle[], index: number) {
  const closes = candles.map((candle) => candle.close);
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  const volumes = candles.map((candle) => candle.volume);
  const features: Record<string, number> = {};
  let warmup = false;

  for (const indicator of indicators) {
    const period = Math.max(1, Math.trunc(toNumber(indicator.params.period, 14)));
    if (indicator.name === "sma") {
      const window = sliceFrom(closes, index, period);
      const value = window.length < period ? null : avg(window);
      features[`sma_${period}`] = value ?? 0;
      warmup ||= value === null;
      continue;
    }
    if (indicator.name === "ema") {
      if (index + 1 < period) {
        features[`ema_${period}`] = 0;
        warmup = true;
        continue;
      }
      features[`ema_${period}`] = calcEma(closes, period, index);
      continue;
    }
    if (indicator.name === "rsi") {
      const value = calcRsi(closes, period, index);
      features[`rsi_${period}`] = value ?? 0;
      warmup ||= value === null;
      continue;
    }
    if (indicator.name === "atr") {
      const value = calcAtr(highs, lows, closes, period, index);
      features[`atr_${period}`] = value ?? 0;
      warmup ||= value === null;
      continue;
    }
    if (indicator.name === "macd") {
      const fast = Math.max(1, Math.trunc(toNumber(indicator.params.fastperiod, 12)));
      const slow = Math.max(fast + 1, Math.trunc(toNumber(indicator.params.slowperiod, 26)));
      const signal = Math.max(1, Math.trunc(toNumber(indicator.params.signalperiod, 9)));
      const value = calcMacd(closes, index, fast, slow, signal);
      features[`macd_${fast}_${slow}_${signal}`] = value?.macd ?? 0;
      features[`macd_signal_${fast}_${slow}_${signal}`] = value?.signal ?? 0;
      features[`macd_hist_${fast}_${slow}_${signal}`] = value?.hist ?? 0;
      warmup ||= value === null;
      continue;
    }
    if (indicator.name === "bbands") {
      const dev = toNumber(indicator.params.nbdevup ?? indicator.params.dev, 2);
      const value = calcBbands(closes, index, period, dev);
      features[`bbands_upper_${period}`] = value?.upper ?? 0;
      features[`bbands_mid_${period}`] = value?.middle ?? 0;
      features[`bbands_lower_${period}`] = value?.lower ?? 0;
      warmup ||= value === null;
      continue;
    }
    if (indicator.name === "vwap") {
      const window = sliceFrom(candles, index, period);
      if (window.length < period) {
        features[`vwap_${period}`] = 0;
        warmup = true;
        continue;
      }
      let numerator = 0;
      let denominator = 0;
      for (const candle of window) {
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;
        numerator += typicalPrice * candle.volume;
        denominator += candle.volume;
      }
      features[`vwap_${period}`] = denominator > 0 ? numerator / denominator : 0;
      continue;
    }
  }

  const last = candles[index];
  const prev = candles[Math.max(0, index - 1)];
  const return1 = prev?.close ? (last.close - prev.close) / prev.close : 0;
  const closeWindow = sliceFrom(closes, index, 20);
  features.last_price = last.close;
  features.price_change = return1;
  features.volatility = closeWindow.length > 1 ? std(closeWindow.map((value, i, arr) => (i === 0 ? 0 : (value - arr[i - 1]) / arr[i - 1]))) : 0;
  features.volume_avg = avg(sliceFrom(volumes, index, 20));
  features.spread = 0;
  features.ideas_score = 0;
  features.signals_score = 0;
  features.news_score = 0;
  features.ocr_score = 0;
  features.news_confidence_avg = 0;
  features.ocr_confidence_avg = 0;
  features.ocr_text_length_avg = 0;
  features.aux_score = 0;
  return { features, warmup };
}

function buildRows(params: {
  pair: string;
  interval: string;
  featureSetVersionId: string;
  schemaFingerprint: string;
  candles: Candle[];
  config: FeatureSetConfig;
}) {
  const indicators = normalizeIndicatorConfig(params.config);
  return params.candles.map((candle, index) => {
    const computed = computeIndicatorFeatures(indicators, params.candles, index);
    return {
      pair: params.pair,
      interval: params.interval,
      feature_set_version_id: params.featureSetVersionId,
      captured_at: candle.open_time,
      schema_fingerprint: params.schemaFingerprint,
      features: computed.features,
      warmup: computed.warmup,
      is_complete: !computed.warmup,
      source_window_start: params.candles[Math.max(0, index - maxLookback(indicators))]?.open_time ?? candle.open_time,
      source_window_end: candle.open_time,
    };
  });
}

export async function listFeatureSnapshots(params: FeatureSnapshotQuery) {
  return listRlFeatureSnapshots({
    pair: params.pair,
    interval: params.interval,
    featureSetVersionId: params.featureSetVersionId,
    start: params.startAt,
    end: params.endAt,
  });
}

export async function ensureFeatureSnapshots(params: FeatureSnapshotQuery) {
  const featureConfig = await getFeatureSetConfigById(params.featureSetVersionId);
  const schemaFingerprint = getFeatureSchemaFingerprint(featureConfig);
  const existing = await listFeatureSnapshots(params);
  const existingByTime = new Set(existing.map((row) => String(row.captured_at)));
  const candleTimes = await listBingxCandleTimes({
    pair: params.pair,
    interval: params.interval,
    start: params.startAt,
    end: params.endAt,
  });
  const missingTimes = candleTimes.filter((time) => !existingByTime.has(time));
  if (missingTimes.length === 0) {
    return existing;
  }

  const lookback = maxLookback(normalizeIndicatorConfig(featureConfig));
  const earliestMissingMs = Math.min(...missingTimes.map((value) => new Date(value).getTime()));
  const intervalMs = params.interval.endsWith("m")
    ? Number(params.interval.replace("m", "")) * 60_000
    : params.interval.endsWith("h")
      ? Number(params.interval.replace("h", "")) * 3_600_000
      : 60_000;
  const fetchStart = new Date(earliestMissingMs - lookback * intervalMs).toISOString();
  const candles = (await listBingxCandles({
    pair: params.pair,
    interval: params.interval,
    start: fetchStart,
    end: params.endAt,
  })) as Candle[];
  if (candles.length === 0) {
    logWarn("feature_snapshot.no_candles", params);
    return existing;
  }

  const computedRows = buildRows({
    pair: params.pair,
    interval: params.interval,
    featureSetVersionId: params.featureSetVersionId,
    schemaFingerprint,
    candles,
    config: featureConfig,
  });
  const missingSet = new Set(missingTimes);
  const upsertRows = computedRows.filter((row) => missingSet.has(row.captured_at));
  if (upsertRows.length > 0) {
    await upsertRlFeatureSnapshots(upsertRows);
  }

  return listFeatureSnapshots(params);
}
