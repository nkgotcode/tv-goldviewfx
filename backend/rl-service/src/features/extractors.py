from __future__ import annotations

from statistics import mean, pstdev
from typing import Iterable

from schemas import AuxiliarySignal, MarketSnapshot


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


def extract_market_features(market: MarketSnapshot) -> dict[str, float]:
    closes = [candle.close for candle in market.candles]
    volumes = [candle.volume for candle in market.candles]
    if len(closes) < 2:
        return {
            "last_price": market.last_price or (closes[-1] if closes else 0.0),
            "price_change": 0.0,
            "volatility": 0.0,
            "volume_avg": mean(volumes) if volumes else 0.0,
            "spread": market.spread or 0.0,
        }

    first_price = closes[0]
    last_price = market.last_price or closes[-1]
    price_change = (last_price - first_price) / first_price if first_price else 0.0
    returns = []
    for prev, curr in zip(closes, closes[1:]):
        if prev == 0:
            returns.append(0.0)
        else:
            returns.append((curr - prev) / prev)

    volatility = pstdev(returns) if len(returns) > 1 else 0.0
    volume_avg = mean(volumes) if volumes else 0.0

    return {
        "last_price": last_price,
        "price_change": price_change,
        "volatility": volatility,
        "volume_avg": volume_avg,
        "spread": market.spread or 0.0,
    }


def _avg_confidence(signals: Iterable[AuxiliarySignal]) -> float:
    values = [signal.confidence for signal in signals if signal.confidence is not None]
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


def extract_aux_features(
    ideas: Iterable[AuxiliarySignal],
    signals: Iterable[AuxiliarySignal],
    news: Iterable[AuxiliarySignal],
    ocr: Iterable[AuxiliarySignal],
) -> dict[str, float]:
    ideas_score = resolve_signal_conflicts(ideas)
    signals_score = resolve_signal_conflicts(signals)
    news_score = resolve_signal_conflicts(news)
    ocr_score = resolve_signal_conflicts(ocr)
    combined = ideas_score + signals_score + news_score + ocr_score

    return {
        "ideas_score": ideas_score,
        "signals_score": signals_score,
        "news_score": news_score,
        "ocr_score": ocr_score,
        "news_confidence_avg": _avg_confidence(news),
        "ocr_confidence_avg": _avg_confidence(ocr),
        "ocr_text_length_avg": _avg_text_length(ocr),
        "aux_score": combined,
    }


def extract_features(
    market: MarketSnapshot,
    ideas: Iterable[AuxiliarySignal],
    signals: Iterable[AuxiliarySignal],
    news: Iterable[AuxiliarySignal],
    ocr: Iterable[AuxiliarySignal],
) -> dict[str, float]:
    features = extract_market_features(market)
    features.update(extract_aux_features(ideas, signals, news, ocr))
    return features
