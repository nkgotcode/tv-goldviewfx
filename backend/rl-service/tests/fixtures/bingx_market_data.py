from __future__ import annotations

from datetime import datetime, timedelta, timezone


def build_bingx_candle_rows(
    count: int = 3,
    pair: str = "Gold-USDT",
    interval: str = "1m",
    start: datetime | None = None,
    base_price: float = 2065.0,
):
    if start is None:
        start = datetime.now(tz=timezone.utc) - timedelta(minutes=count)
    rows = []
    price = base_price
    for index in range(count):
        open_time = start + timedelta(minutes=index)
        close_time = open_time + timedelta(minutes=1)
        rows.append(
            {
                "pair": pair,
                "interval": interval,
                "open_time": open_time.isoformat(),
                "close_time": close_time.isoformat(),
                "open": price,
                "high": price + 1.2,
                "low": price - 0.8,
                "close": price + 0.4,
                "volume": 100 + index,
                "quote_volume": 200 + index,
            }
        )
        price += 0.4
    return rows


def build_bingx_ticker_row(pair: str = "Gold-USDT"):
    now = datetime.now(tz=timezone.utc)
    return {
        "pair": pair,
        "last_price": 2066.8,
        "volume_24h": 50231.4,
        "price_change_24h": 1.25,
        "captured_at": now.isoformat(),
    }


DEFAULT_BINGX_CANDLE_ROWS = build_bingx_candle_rows()
DEFAULT_BINGX_TICKER_ROW = build_bingx_ticker_row()
