from __future__ import annotations

from datetime import datetime, timedelta, timezone


def build_candles(count: int = 30, start: datetime | None = None, interval_minutes: int = 1, base_price: float = 2300.0):
    if start is None:
        start = datetime.now(tz=timezone.utc) - timedelta(minutes=count)
    candles = []
    price = base_price
    for i in range(count):
        timestamp = start + timedelta(minutes=i * interval_minutes)
        open_price = price
        high = open_price + 2.5
        low = open_price - 2.0
        close = open_price + 0.5
        volume = 100 + i
        candles.append(
            {
                "timestamp": timestamp.isoformat(),
                "open": open_price,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            }
        )
        price = close
    return candles


def build_market_snapshot(pair: str = "Gold-USDT", count: int = 30):
    candles = build_candles(count=count)
    return {
        "pair": pair,
        "candles": candles,
        "last_price": candles[-1]["close"],
        "spread": 0.8,
    }


DEFAULT_MARKET_SNAPSHOT = build_market_snapshot()
