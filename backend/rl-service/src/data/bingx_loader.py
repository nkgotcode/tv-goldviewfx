from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from convex import ConvexClient

from schemas import MarketCandle, MarketSnapshot, TradingPair


class BingxMarketDataLoader:
    def __init__(self, convex_url: str, timeout_ms: int = 10_000) -> None:
        if not convex_url:
            raise ValueError("convex_url is required")
        self._client = ConvexClient(convex_url)
        self._timeout_ms = timeout_ms

    def close(self) -> None:
        return None

    def fetch_candles(self, pair: TradingPair, interval: str, limit: int = 200) -> list[MarketCandle]:
        rows = self._query(
            {
                "table": "bingx_candles",
                "select": ["open_time", "open", "high", "low", "close", "volume"],
                "filters": [
                    {"field": "pair", "op": "eq", "value": pair.value},
                    {"field": "interval", "op": "eq", "value": interval},
                ],
                "order": {"field": "open_time", "direction": "asc"},
                "limit": limit,
            }
        )
        return parse_candle_rows(rows)

    def fetch_latest_ticker(self, pair: TradingPair) -> dict | None:
        rows = self._query(
            {
                "table": "bingx_tickers",
                "select": ["last_price", "volume_24h", "price_change_24h", "captured_at"],
                "filters": [{"field": "pair", "op": "eq", "value": pair.value}],
                "order": {"field": "captured_at", "direction": "desc"},
                "limit": 1,
            }
        )
        return rows[0] if rows else None

    def load_market_snapshot(self, pair: TradingPair, interval: str, limit: int = 200) -> MarketSnapshot:
        candles = self.fetch_candles(pair, interval, limit=limit)
        ticker = self.fetch_latest_ticker(pair)
        last_price = ticker.get("last_price") if ticker else None
        return build_market_snapshot(pair, candles, last_price=last_price)

    def _query(self, payload: dict) -> list[dict]:
        response = self._client.query("data:query", payload)
        if isinstance(response, dict):
            rows = response.get("data")
            if isinstance(rows, list):
                return rows
        return []


def parse_candle_rows(rows: Iterable[dict]) -> list[MarketCandle]:
    candles: list[MarketCandle] = []
    for row in rows:
        timestamp = _parse_timestamp(row.get("open_time") or row.get("timestamp"))
        if not timestamp:
            continue
        candles.append(
            MarketCandle(
                timestamp=timestamp,
                open=float(row.get("open") or 0),
                high=float(row.get("high") or 0),
                low=float(row.get("low") or 0),
                close=float(row.get("close") or 0),
                volume=float(row.get("volume") or 0),
            )
        )
    return candles


def build_market_snapshot(
    pair: TradingPair,
    candles: list[MarketCandle],
    last_price: float | None = None,
    spread: float | None = None,
) -> MarketSnapshot:
    return MarketSnapshot(pair=pair, candles=candles, last_price=last_price, spread=spread)


def _parse_timestamp(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        seconds = value / 1000 if value > 1_000_000_000_000 else value
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed
    return None
