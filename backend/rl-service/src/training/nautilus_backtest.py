from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from typing import Iterable

from nautilus_trader.backtest.node import BacktestNode
from nautilus_trader.config import BacktestDataConfig, BacktestEngineConfig, BacktestRunConfig, BacktestVenueConfig
from nautilus_trader.config import ImportableStrategyConfig
from nautilus_trader.model.data import Bar, BarAggregation, BarSpecification, BarType
from nautilus_trader.model.enums import AccountType, OmsType, PriceType
from nautilus_trader.model.identifiers import InstrumentId, Symbol, Venue
from nautilus_trader.model.instruments.crypto_perpetual import CryptoPerpetual
from nautilus_trader.model.objects import Currency, Price, Quantity
from nautilus_trader.persistence.catalog.parquet import ParquetDataCatalog


def _base_currency_for_pair(pair: str) -> str:
    normalized = pair.replace("-", "").upper()
    if normalized.startswith("GOLD") or normalized.startswith("XAUT") or normalized.startswith("PAXG"):
        return "XAU"
    if normalized.endswith("USDT") and len(normalized) > 4:
        return normalized[:-4]
    return "XAU"


def _to_float(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _to_int(value: object) -> int | None:
    parsed = _to_float(value)
    if parsed is None:
        return None
    casted = int(parsed)
    if casted < 0 or casted > 12:
        return None
    return casted


def _decimal_places(step: float) -> int:
    text = f"{step:.12f}".rstrip("0").rstrip(".")
    if "." not in text:
        return 0
    return len(text.split(".")[1])


def _canonical_step(step: float | None, precision: int) -> float:
    if step is not None and step > 0:
        return float(f"{step:.12f}")
    precision = max(0, min(12, precision))
    return float(f"{1 / (10 ** precision):.{precision}f}")


def _resolve_instrument_meta(instrument_meta: dict | None) -> tuple[int, int, str, str]:
    instrument_meta = instrument_meta or {}
    price_precision = _to_int(instrument_meta.get("pricePrecision") or instrument_meta.get("price_precision"))
    size_precision = _to_int(instrument_meta.get("quantityPrecision") or instrument_meta.get("quantity_precision"))
    price_step = _to_float(
        instrument_meta.get("priceStep")
        or instrument_meta.get("price_step")
        or instrument_meta.get("tickSize")
        or instrument_meta.get("tick_size")
    )
    size_step = _to_float(
        instrument_meta.get("quantityStep")
        or instrument_meta.get("quantity_step")
        or instrument_meta.get("stepSize")
        or instrument_meta.get("step_size")
    )

    resolved_price_precision = price_precision if price_precision is not None else _decimal_places(price_step or 0.01)
    resolved_size_precision = size_precision if size_precision is not None else _decimal_places(size_step or 0.001)
    resolved_price_step = _canonical_step(price_step, resolved_price_precision)
    resolved_size_step = _canonical_step(size_step, resolved_size_precision)

    return (
        resolved_price_precision,
        resolved_size_precision,
        f"{resolved_price_step:.{max(1, _decimal_places(resolved_price_step))}f}",
        f"{resolved_size_step:.{max(1, _decimal_places(resolved_size_step))}f}",
    )


def _build_instrument(pair: str, instrument_meta: dict | None = None, venue: str = "BINGX") -> CryptoPerpetual:
    symbol = pair.replace("-", "")
    instrument_id = InstrumentId(Symbol(symbol), Venue(venue))
    price_precision, size_precision, price_increment, size_increment = _resolve_instrument_meta(instrument_meta)
    return CryptoPerpetual(
        instrument_id=instrument_id,
        raw_symbol=Symbol(symbol),
        base_currency=Currency.from_str(_base_currency_for_pair(pair)),
        quote_currency=Currency.from_str("USDT"),
        settlement_currency=Currency.from_str("USDT"),
        is_inverse=False,
        price_precision=price_precision,
        size_precision=size_precision,
        price_increment=Price.from_str(price_increment),
        size_increment=Quantity.from_str(size_increment),
        ts_event=0,
        ts_init=0,
    )


def _to_ts_nanos(timestamp: str) -> int:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1_000_000_000)


def _format_decimal(value: float, precision: int) -> str:
    return f"{value:.{precision}f}"


def _build_bars(
    instrument_id: InstrumentId,
    bar_type: BarType,
    features: Iterable[dict],
    price_precision: int,
    size_precision: int,
) -> list[Bar]:
    bars: list[Bar] = []
    for item in features:
        ts_event = _to_ts_nanos(str(item.get("timestamp")))
        bars.append(
            Bar(
                bar_type=bar_type,
                open=Price.from_str(_format_decimal(float(item.get("open", 0.0)), price_precision)),
                high=Price.from_str(_format_decimal(float(item.get("high", 0.0)), price_precision)),
                low=Price.from_str(_format_decimal(float(item.get("low", 0.0)), price_precision)),
                close=Price.from_str(_format_decimal(float(item.get("close", 0.0)), price_precision)),
                volume=Quantity.from_str(_format_decimal(float(item.get("volume", 0.0)), size_precision)),
                ts_event=ts_event,
                ts_init=ts_event,
            )
        )
    return bars


def run_backtest(
    pair: str,
    interval: str,
    features: list[dict],
    model_path: str,
    window_size: int,
    decision_threshold: float,
    instrument_meta: dict | None = None,
):
    instrument = _build_instrument(pair, instrument_meta=instrument_meta)
    price_precision, size_precision, _, _ = _resolve_instrument_meta(instrument_meta)
    bar_spec = BarSpecification(1, BarAggregation.MINUTE, PriceType.LAST)
    if interval.endswith("m"):
        bar_spec = BarSpecification(int(interval[:-1]), BarAggregation.MINUTE, PriceType.LAST)
    elif interval.endswith("h"):
        bar_spec = BarSpecification(int(interval[:-1]), BarAggregation.HOUR, PriceType.LAST)
    bar_type = BarType(instrument.id, bar_spec)

    with tempfile.TemporaryDirectory() as tmpdir:
        catalog = ParquetDataCatalog(tmpdir)
        catalog.write_data([instrument])
        bars = _build_bars(
            instrument.id,
            bar_type,
            features,
            price_precision=price_precision,
            size_precision=size_precision,
        )
        catalog.write_data(bars)

        strategy_config = ImportableStrategyConfig(
            strategy_path="training.rl_strategy:RLSb3Strategy",
            config_path="training.rl_strategy:RLSb3StrategyConfig",
            config={
                "instrument_id": instrument.id,
                "bar_type": str(bar_type),
                "trade_size": _format_decimal(1.0, size_precision),
                "model_path": model_path,
                "decision_threshold": decision_threshold,
                "window_size": window_size,
            },
        )

        engine_config = BacktestEngineConfig(strategies=[strategy_config])
        venue_config = BacktestVenueConfig(
            name="BINGX",
            oms_type=OmsType.HEDGING,
            account_type=AccountType.MARGIN,
            starting_balances=["100000 USDT"],
        )
        data_config = BacktestDataConfig(
            catalog_path=tmpdir,
            data_cls="nautilus_trader.model.data:Bar",
            instrument_id=instrument.id,
            bar_spec=str(bar_spec),
        )
        run_config = BacktestRunConfig(
            venues=[venue_config],
            data=[data_config],
            engine=engine_config,
            raise_exception=True,
        )
        node = BacktestNode([run_config])
        try:
            results = node.run()
        except Exception as exc:
            raise RuntimeError("Nautilus backtest failed") from exc
        if not results:
            raise RuntimeError("Nautilus backtest produced no results")
        return results[0]
