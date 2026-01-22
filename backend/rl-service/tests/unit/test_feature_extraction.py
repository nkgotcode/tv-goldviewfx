import math

from features.extractors import extract_features
from schemas import AuxiliarySignal, MarketSnapshot
from tests.fixtures.market_data import DEFAULT_MARKET_SNAPSHOT


def test_extract_features_includes_market_and_aux_scores():
    market = MarketSnapshot(**DEFAULT_MARKET_SNAPSHOT)
    ideas = [AuxiliarySignal(source="ideas", timestamp=market.candles[-1].timestamp, score=0.4, confidence=0.8)]
    signals = [AuxiliarySignal(source="signals", timestamp=market.candles[-1].timestamp, score=0.2, confidence=0.9)]
    news = [AuxiliarySignal(source="news", timestamp=market.candles[-1].timestamp, score=-0.1, confidence=0.6)]
    ocr = [
        AuxiliarySignal(
            source="ocr_text",
            timestamp=market.candles[-1].timestamp,
            score=0.05,
            confidence=0.7,
            metadata={"text": "Gold breakout annotation"},
        )
    ]

    features = extract_features(market, ideas, signals, news, ocr)

    assert "last_price" in features
    assert "price_change" in features
    assert "volatility" in features
    assert "volume_avg" in features
    assert "aux_score" in features
    assert "ocr_score" in features
    assert "ocr_text_length_avg" in features
    assert math.isfinite(features["price_change"])
    assert features["volume_avg"] > 0
