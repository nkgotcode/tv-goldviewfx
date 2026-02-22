from datetime import datetime, timedelta, timezone

from features.technical_pipeline import build_feature_snapshot
from schemas import MarketSnapshot


def _market_snapshot(count: int = 40) -> MarketSnapshot:
    start = datetime(2024, 1, 1, tzinfo=timezone.utc)
    candles = []
    for idx in range(count):
        ts = start + timedelta(minutes=idx)
        price = 2000 + idx * 0.4
        candles.append(
            {
                "timestamp": ts.isoformat(),
                "open": price,
                "high": price + 0.8,
                "low": price - 0.6,
                "close": price + 0.2,
                "volume": 100 + idx,
            }
        )
    return MarketSnapshot(pair="Gold-USDT", candles=candles, last_price=candles[-1]["close"])


def test_talib_pipeline_is_deterministic():
    market = _market_snapshot(60)
    first = build_feature_snapshot(market)
    second = build_feature_snapshot(market)

    assert first.schema_fingerprint == second.schema_fingerprint
    assert first.feature_keys == second.feature_keys
    assert first.features == second.features
    assert first.warmup is False


def test_talib_pipeline_flags_warmup_for_short_windows():
    market = _market_snapshot(5)
    result = build_feature_snapshot(market)

    assert result.warmup is True
    assert "sma_20" in result.features
    assert "rsi_14" in result.features
