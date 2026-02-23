from __future__ import annotations

from typing import Iterable

from features.technical_pipeline import (
    AUX_FEATURE_KEYS,
    BASE_FEATURE_KEYS,
    build_feature_snapshot,
    vectorize,
)
from schemas import AuxiliarySignal, MarketSnapshot

DEFAULT_TECHNICAL_KEYS = [
    "sma_20",
    "ema_21",
    "rsi_14",
    "atr_14",
    "macd_12_26_9",
    "macd_signal_12_26_9",
    "macd_hist_12_26_9",
]
FUTURES_FEATURE_KEYS = [
    "funding_rate",
    "funding_rate_annualized",
    "open_interest",
    "open_interest_delta_pct",
    "mark_price",
    "index_price",
    "mark_index_basis_bps",
    "ticker_last_price",
    "ticker_price_change_24h",
    "ticker_volume_24h",
]
FEATURE_KEYS = [*BASE_FEATURE_KEYS, *DEFAULT_TECHNICAL_KEYS, *FUTURES_FEATURE_KEYS, *AUX_FEATURE_KEYS]


def resolve_feature_keys(extras: list[str] | None = None) -> list[str]:
    if not extras:
        return FEATURE_KEYS
    dynamic = sorted({key for key in extras if isinstance(key, str) and key.strip()})
    return [*FEATURE_KEYS, *dynamic]


def resolve_signal_conflicts(signals: Iterable[AuxiliarySignal], neutral_band: float = 0.1) -> float:
    weighted = []
    for signal in signals:
        confidence = signal.confidence if signal.confidence is not None else 1.0
        weighted.append(signal.score * confidence)
    positive = sum(value for value in weighted if value > 0)
    negative = abs(sum(value for value in weighted if value < 0))
    net = positive - negative
    if positive > 0 and negative > 0 and abs(net) < neutral_band:
        return 0.0
    return net


def extract_market_features(market: MarketSnapshot, technical_config: dict | None = None) -> dict[str, float]:
    return build_feature_snapshot(market, technical_config=technical_config).features


def extract_aux_features(
    ideas: Iterable[AuxiliarySignal],
    signals: Iterable[AuxiliarySignal],
    news: Iterable[AuxiliarySignal],
    ocr: Iterable[AuxiliarySignal],
) -> dict[str, float]:
    ideas_list = list(ideas)
    signals_list = list(signals)
    news_list = list(news)
    ocr_list = list(ocr)
    # Build from a synthetic 2-candle market snapshot to preserve canonical aux fields.
    if ideas_list:
        last_ts = ideas_list[-1].timestamp
    elif signals_list:
        last_ts = signals_list[-1].timestamp
    elif news_list:
        last_ts = news_list[-1].timestamp
    elif ocr_list:
        last_ts = ocr_list[-1].timestamp
    else:
        from datetime import datetime, timezone

        last_ts = datetime.now(tz=timezone.utc)
    market = MarketSnapshot(
        pair="XAUTUSDT",
        candles=[
            {
                "timestamp": last_ts,
                "open": 1.0,
                "high": 1.0,
                "low": 1.0,
                "close": 1.0,
                "volume": 1.0,
            },
            {
                "timestamp": last_ts,
                "open": 1.0,
                "high": 1.0,
                "low": 1.0,
                "close": 1.0,
                "volume": 1.0,
            },
        ],
    )
    features = build_feature_snapshot(market, ideas=ideas_list, signals=signals_list, news=news_list, ocr=ocr_list).features
    return {key: features.get(key, 0.0) for key in AUX_FEATURE_KEYS}


def extract_features(
    market: MarketSnapshot,
    ideas: Iterable[AuxiliarySignal],
    signals: Iterable[AuxiliarySignal],
    news: Iterable[AuxiliarySignal],
    ocr: Iterable[AuxiliarySignal],
    technical_config: dict | None = None,
) -> dict[str, float]:
    return build_feature_snapshot(
        market,
        ideas=ideas,
        signals=signals,
        news=news,
        ocr=ocr,
        technical_config=technical_config,
    ).features


def feature_keys_for(features: dict[str, float]) -> list[str]:
    fixed_keys = BASE_FEATURE_KEYS + FUTURES_FEATURE_KEYS + AUX_FEATURE_KEYS
    indicator_keys = sorted([key for key in features if key not in fixed_keys])
    return [*BASE_FEATURE_KEYS, *indicator_keys, *FUTURES_FEATURE_KEYS, *AUX_FEATURE_KEYS]


def vectorize_features(features: dict[str, float], feature_keys: list[str] | None = None) -> list[float]:
    keys = feature_keys or FEATURE_KEYS
    return vectorize(features, keys)
