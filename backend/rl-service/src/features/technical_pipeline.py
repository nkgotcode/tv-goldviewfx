from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
from statistics import mean, pstdev
from typing import Iterable

import numpy as np

from schemas import AuxiliarySignal, MarketSnapshot

try:  # pragma: no cover - optional dependency
    import talib  # type: ignore
except Exception:  # pragma: no cover - runtime fallback
    talib = None


BASE_FEATURE_KEYS = ["last_price", "price_change", "volatility", "volume_avg", "spread"]
AUX_FEATURE_KEYS = [
    "ideas_score",
    "signals_score",
    "news_score",
    "ocr_score",
    "news_confidence_avg",
    "ocr_confidence_avg",
    "ocr_text_length_avg",
    "aux_score",
]
DEFAULT_INDICATORS = [
    {"name": "sma", "params": {"period": 20}},
    {"name": "ema", "params": {"period": 21}},
    {"name": "rsi", "params": {"period": 14}},
    {"name": "atr", "params": {"period": 14}},
    {"name": "macd", "params": {"fastperiod": 12, "slowperiod": 26, "signalperiod": 9}},
]


@dataclass(frozen=True)
class PipelineResult:
    features: dict[str, float]
    feature_keys: list[str]
    warmup: bool
    schema_fingerprint: str


def _resolve_signal_conflicts(signals: Iterable[AuxiliarySignal], neutral_band: float = 0.1) -> float:
    weighted = []
    for signal in signals:
        confidence = signal.confidence if signal.confidence is not None else 1.0
        weighted.append(float(signal.score) * float(confidence))
    positive = sum(value for value in weighted if value > 0)
    negative = abs(sum(value for value in weighted if value < 0))
    net = positive - negative
    if positive > 0 and negative > 0 and abs(net) < neutral_band:
        return 0.0
    return net


def _avg_confidence(signals: Iterable[AuxiliarySignal]) -> float:
    values = [float(signal.confidence) for signal in signals if signal.confidence is not None]
    return mean(values) if values else 0.0


def _avg_text_length(signals: Iterable[AuxiliarySignal]) -> float:
    lengths: list[int] = []
    for signal in signals:
        if not signal.metadata:
            continue
        text = signal.metadata.get("text")
        if isinstance(text, str):
            lengths.append(len(text))
    return mean(lengths) if lengths else 0.0


def _normalize_indicators(indicators: Iterable[dict] | None) -> list[dict]:
    resolved: list[dict] = []
    source = indicators if indicators is not None else DEFAULT_INDICATORS
    for indicator in source:
        name = str(indicator.get("name", "")).strip().lower()
        if not name:
            continue
        params = indicator.get("params") or {}
        parsed_params = {}
        for key, value in params.items():
            try:
                parsed_params[str(key).lower()] = float(value)
            except (TypeError, ValueError):
                continue
        resolved.append({"name": name, "params": parsed_params})
    return resolved


def _canonical_keys(features: dict[str, float]) -> list[str]:
    indicator_keys = sorted([key for key in features if key not in BASE_FEATURE_KEYS + AUX_FEATURE_KEYS])
    return [*BASE_FEATURE_KEYS, *indicator_keys, *AUX_FEATURE_KEYS]


def _sma(values: np.ndarray, period: int) -> np.ndarray:
    out = np.full(values.shape, np.nan, dtype=float)
    if period <= 0:
        return out
    for idx in range(period - 1, len(values)):
        out[idx] = float(np.mean(values[idx - period + 1 : idx + 1]))
    return out


def _ema(values: np.ndarray, period: int) -> np.ndarray:
    out = np.full(values.shape, np.nan, dtype=float)
    if period <= 0 or len(values) == 0:
        return out
    alpha = 2 / (period + 1)
    ema = float(values[0])
    for idx, value in enumerate(values):
        ema = float(value) if idx == 0 else alpha * float(value) + (1 - alpha) * ema
        if idx >= period - 1:
            out[idx] = ema
    return out


def _rsi(values: np.ndarray, period: int) -> np.ndarray:
    out = np.full(values.shape, np.nan, dtype=float)
    if period <= 0 or len(values) < period + 1:
        return out
    deltas = np.diff(values)
    gains = np.maximum(deltas, 0)
    losses = np.maximum(-deltas, 0)
    for idx in range(period, len(values)):
        gain = float(np.mean(gains[idx - period : idx]))
        loss = float(np.mean(losses[idx - period : idx]))
        if loss == 0:
            out[idx] = 100.0
        else:
            rs = gain / loss
            out[idx] = 100 - 100 / (1 + rs)
    return out


def _atr(high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int) -> np.ndarray:
    out = np.full(close.shape, np.nan, dtype=float)
    if period <= 0 or len(close) < period + 1:
        return out
    trs = np.zeros_like(close, dtype=float)
    trs[0] = high[0] - low[0]
    for idx in range(1, len(close)):
        tr = max(
            high[idx] - low[idx],
            abs(high[idx] - close[idx - 1]),
            abs(low[idx] - close[idx - 1]),
        )
        trs[idx] = tr
    for idx in range(period, len(close)):
        out[idx] = float(np.mean(trs[idx - period + 1 : idx + 1]))
    return out


def _macd(values: np.ndarray, fast: int, slow: int, signal: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    fast_ema = _ema(values, fast)
    slow_ema = _ema(values, slow)
    macd = fast_ema - slow_ema
    signal_line = _ema(np.nan_to_num(macd, nan=0.0), signal)
    hist = macd - signal_line
    return macd, signal_line, hist


def _bbands(values: np.ndarray, period: int, dev: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    upper = np.full(values.shape, np.nan, dtype=float)
    mid = np.full(values.shape, np.nan, dtype=float)
    lower = np.full(values.shape, np.nan, dtype=float)
    if period <= 0:
        return upper, mid, lower
    for idx in range(period - 1, len(values)):
        window = values[idx - period + 1 : idx + 1]
        m = float(np.mean(window))
        s = float(np.std(window))
        mid[idx] = m
        upper[idx] = m + dev * s
        lower[idx] = m - dev * s
    return upper, mid, lower


def _compute_indicator_values(
    close: np.ndarray,
    high: np.ndarray,
    low: np.ndarray,
    indicators: list[dict],
) -> tuple[dict[str, float], bool]:
    result: dict[str, float] = {}
    warmup = False
    for indicator in indicators:
        name = indicator["name"]
        params = indicator["params"]
        period = max(1, int(params.get("period", 14)))
        if name == "sma":
            key = f"sma_{period}"
            series = talib.SMA(close, timeperiod=period) if talib is not None else _sma(close, period)
            value = float(series[-1]) if len(series) else 0.0
            result[key] = value if np.isfinite(value) else 0.0
            warmup |= not np.isfinite(value)
            continue
        if name == "ema":
            key = f"ema_{period}"
            series = talib.EMA(close, timeperiod=period) if talib is not None else _ema(close, period)
            value = float(series[-1]) if len(series) else 0.0
            result[key] = value if np.isfinite(value) else 0.0
            warmup |= not np.isfinite(value)
            continue
        if name == "rsi":
            key = f"rsi_{period}"
            series = talib.RSI(close, timeperiod=period) if talib is not None else _rsi(close, period)
            value = float(series[-1]) if len(series) else 0.0
            result[key] = value if np.isfinite(value) else 0.0
            warmup |= not np.isfinite(value)
            continue
        if name == "atr":
            key = f"atr_{period}"
            series = talib.ATR(high, low, close, timeperiod=period) if talib is not None else _atr(high, low, close, period)
            value = float(series[-1]) if len(series) else 0.0
            result[key] = value if np.isfinite(value) else 0.0
            warmup |= not np.isfinite(value)
            continue
        if name == "macd":
            fast = max(1, int(params.get("fastperiod", 12)))
            slow = max(fast + 1, int(params.get("slowperiod", 26)))
            signal = max(1, int(params.get("signalperiod", 9)))
            if talib is not None:
                macd, signal_line, hist = talib.MACD(close, fastperiod=fast, slowperiod=slow, signalperiod=signal)
            else:
                macd, signal_line, hist = _macd(close, fast, slow, signal)
            macd_v = float(macd[-1]) if len(macd) else 0.0
            signal_v = float(signal_line[-1]) if len(signal_line) else 0.0
            hist_v = float(hist[-1]) if len(hist) else 0.0
            result[f"macd_{fast}_{slow}_{signal}"] = macd_v if np.isfinite(macd_v) else 0.0
            result[f"macd_signal_{fast}_{slow}_{signal}"] = signal_v if np.isfinite(signal_v) else 0.0
            result[f"macd_hist_{fast}_{slow}_{signal}"] = hist_v if np.isfinite(hist_v) else 0.0
            warmup |= not np.isfinite(macd_v) or not np.isfinite(signal_v) or not np.isfinite(hist_v)
            continue
        if name == "bbands":
            dev = float(params.get("nbdevup", params.get("dev", 2.0)))
            if talib is not None:
                upper, mid, lower = talib.BBANDS(close, timeperiod=period, nbdevup=dev, nbdevdn=dev)
            else:
                upper, mid, lower = _bbands(close, period, dev)
            upper_v = float(upper[-1]) if len(upper) else 0.0
            mid_v = float(mid[-1]) if len(mid) else 0.0
            lower_v = float(lower[-1]) if len(lower) else 0.0
            result[f"bbands_upper_{period}"] = upper_v if np.isfinite(upper_v) else 0.0
            result[f"bbands_mid_{period}"] = mid_v if np.isfinite(mid_v) else 0.0
            result[f"bbands_lower_{period}"] = lower_v if np.isfinite(lower_v) else 0.0
            warmup |= not np.isfinite(upper_v) or not np.isfinite(mid_v) or not np.isfinite(lower_v)
            continue
    return result, warmup


def build_feature_snapshot(
    market: MarketSnapshot,
    ideas: Iterable[AuxiliarySignal] = (),
    signals: Iterable[AuxiliarySignal] = (),
    news: Iterable[AuxiliarySignal] = (),
    ocr: Iterable[AuxiliarySignal] = (),
    technical_config: dict | None = None,
) -> PipelineResult:
    candles = market.candles
    closes = np.array([float(candle.close) for candle in candles], dtype=float)
    highs = np.array([float(candle.high) for candle in candles], dtype=float)
    lows = np.array([float(candle.low) for candle in candles], dtype=float)
    volumes = [float(candle.volume) for candle in candles]
    last_price = float(market.last_price if market.last_price is not None else (closes[-1] if len(closes) else 0.0))

    if len(closes) < 2:
        market_features = {
            "last_price": last_price,
            "price_change": 0.0,
            "volatility": 0.0,
            "volume_avg": mean(volumes) if volumes else 0.0,
            "spread": float(market.spread or 0.0),
        }
    else:
        first_price = float(closes[0])
        returns = []
        for prev, curr in zip(closes, closes[1:]):
            returns.append((curr - prev) / prev if prev else 0.0)
        market_features = {
            "last_price": last_price,
            "price_change": (last_price - first_price) / first_price if first_price else 0.0,
            "volatility": pstdev(returns) if len(returns) > 1 else 0.0,
            "volume_avg": mean(volumes) if volumes else 0.0,
            "spread": float(market.spread or 0.0),
        }

    if technical_config and technical_config.get("enabled") is False:
        indicators = []
    else:
        indicators = _normalize_indicators((technical_config or {}).get("indicators"))
    indicator_values, warmup = _compute_indicator_values(closes, highs, lows, indicators)

    ideas_score = _resolve_signal_conflicts(ideas)
    signals_score = _resolve_signal_conflicts(signals)
    news_score = _resolve_signal_conflicts(news)
    ocr_score = _resolve_signal_conflicts(ocr)
    aux_features = {
        "ideas_score": ideas_score,
        "signals_score": signals_score,
        "news_score": news_score,
        "ocr_score": ocr_score,
        "news_confidence_avg": _avg_confidence(news),
        "ocr_confidence_avg": _avg_confidence(ocr),
        "ocr_text_length_avg": _avg_text_length(ocr),
        "aux_score": ideas_score + signals_score + news_score + ocr_score,
    }

    features = {**market_features, **indicator_values, **aux_features}
    for key, value in list(features.items()):
        numeric = float(value)
        features[key] = numeric if np.isfinite(numeric) else 0.0

    schema_fingerprint = sha256(
        json.dumps(
            {
                "technical_config": technical_config or {},
                "keys": _canonical_keys(features),
            },
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    return PipelineResult(
        features=features,
        feature_keys=_canonical_keys(features),
        warmup=warmup,
        schema_fingerprint=schema_fingerprint,
    )


def vectorize(features: dict[str, float], feature_keys: list[str]) -> list[float]:
    return [float(features.get(key, 0.0)) for key in feature_keys]
