from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

import httpx

from schemas import MarketCandle, MarketSnapshot, TradingPair


class BingxMarketDataLoader:
    def __init__(self, supabase_url: str, supabase_key: str, timeout_ms: int = 10_000) -> None:
        if not supabase_url:
            raise ValueError("supabase_url is required")
        if not supabase_key:
            raise ValueError("supabase_key is required")
        self._base_url = supabase_url.rstrip("/") + "/rest/v1"
        self._headers = {
            "Authorization": f"Bearer {supabase_key}",
            "apikey": supabase_key,
        }
        self._client = httpx.Client(timeout=timeout_ms / 1000)

    def close(self) -> None:
        self._client.close()

    def fetch_candles(self, pair: TradingPair, interval: str, limit: int = 200) -> list[MarketCandle]:
        rows = self._get(
            "bingx_candles",
            {
                "select": "open_time,open,high,low,close,volume",
                "pair": f"eq.{pair.value}",
                "interval": f"eq.{interval}",
                "order": "open_time.asc",
                "limit": str(limit),
            },
        )
        return parse_candle_rows(rows)

    def fetch_latest_ticker(self, pair: TradingPair) -> dict | None:
        rows = self._get(
            "bingx_tickers",
            {
                "select": "last_price,volume_24h,price_change_24h,captured_at",
                "pair": f"eq.{pair.value}",
                "order": "captured_at.desc",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    def load_market_snapshot(self, pair: TradingPair, interval: str, limit: int = 200) -> MarketSnapshot:
        candles = self.fetch_candles(pair, interval, limit=limit)
        ticker = self.fetch_latest_ticker(pair)
        last_price = ticker.get("last_price") if ticker else None
        return build_market_snapshot(pair, candles, last_price=last_price)

    def _get(self, resource: str, params: dict[str, str]) -> list[dict]:
        response = self._client.get(f"{self._base_url}/{resource}", params=params, headers=self._headers)
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, list) else []


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
