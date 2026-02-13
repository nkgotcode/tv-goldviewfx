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


def _build_instrument(pair: str, venue: str = "BINGX") -> CryptoPerpetual:
    symbol = pair.replace("-", "")
    instrument_id = InstrumentId(Symbol(symbol), Venue(venue))
    return CryptoPerpetual(
        instrument_id=instrument_id,
        raw_symbol=Symbol(symbol),
        base_currency=Currency.from_str("XAU") if pair == "Gold-USDT" else Currency.from_str("XAU"),
        quote_currency=Currency.from_str("USDT"),
        settlement_currency=Currency.from_str("USDT"),
        is_inverse=False,
        price_precision=2,
        size_precision=3,
        price_increment=Price.from_str("0.01"),
        size_increment=Quantity.from_str("0.001"),
        ts_event=0,
        ts_init=0,
    )


def _to_ts_nanos(timestamp: str) -> int:
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1_000_000_000)


def _format_price(value: float) -> str:
    return f"{value:.2f}"


def _format_qty(value: float) -> str:
    return f"{value:.3f}"


def _build_bars(
    instrument_id: InstrumentId,
    bar_type: BarType,
    features: Iterable[dict],
) -> list[Bar]:
    bars: list[Bar] = []
    for item in features:
        ts_event = _to_ts_nanos(str(item.get("timestamp")))
        bars.append(
            Bar(
                bar_type=bar_type,
                open=Price.from_str(_format_price(float(item.get("open", 0.0)))),
                high=Price.from_str(_format_price(float(item.get("high", 0.0)))),
                low=Price.from_str(_format_price(float(item.get("low", 0.0)))),
                close=Price.from_str(_format_price(float(item.get("close", 0.0)))),
                volume=Quantity.from_str(_format_qty(float(item.get("volume", 0.0)))),
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
):
    instrument = _build_instrument(pair)
    bar_spec = BarSpecification(1, BarAggregation.MINUTE, PriceType.LAST)
    if interval.endswith("m"):
        bar_spec = BarSpecification(int(interval[:-1]), BarAggregation.MINUTE, PriceType.LAST)
    elif interval.endswith("h"):
        bar_spec = BarSpecification(int(interval[:-1]), BarAggregation.HOUR, PriceType.LAST)
    bar_type = BarType(instrument.id, bar_spec)

    with tempfile.TemporaryDirectory() as tmpdir:
        catalog = ParquetDataCatalog(tmpdir)
        catalog.write_data([instrument])
        bars = _build_bars(instrument.id, bar_type, features)
        catalog.write_data(bars)

        strategy_config = ImportableStrategyConfig(
            strategy_path="training.rl_strategy:RLSb3Strategy",
            config_path="training.rl_strategy:RLSb3StrategyConfig",
            config={
                "instrument_id": instrument.id,
                "bar_type": str(bar_type),
                "trade_size": _format_qty(1.0),
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
