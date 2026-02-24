from __future__ import annotations

from dataclasses import dataclass
import tempfile
from datetime import datetime, timezone
from typing import Any, Iterable, Mapping

from nautilus_trader.backtest.node import BacktestNode
from nautilus_trader.config import BacktestDataConfig, BacktestEngineConfig, BacktestRunConfig, BacktestVenueConfig
from nautilus_trader.config import ImportableStrategyConfig
from nautilus_trader.model.data import Bar, BarAggregation, BarSpecification, BarType
from nautilus_trader.model.enums import AccountType, OmsType, PriceType
from nautilus_trader.model.identifiers import InstrumentId, Symbol, Venue
from nautilus_trader.model.instruments.crypto_perpetual import CryptoPerpetual
from nautilus_trader.model.objects import Currency, Price, Quantity
from nautilus_trader.persistence.catalog.parquet import ParquetDataCatalog


@dataclass(frozen=True)
class MatrixBacktestResult:
    strategy_id: str
    venue_id: str
    venue_name: str
    result: object


# Backtest fidelity modes (phased): L1 = quotes/trades (better slippage), L2/L3 = order book sim (highest realism)
BACKTEST_MODE_L1 = "l1"
BACKTEST_MODE_L2 = "l2"
BACKTEST_MODE_L3 = "l3"
BACKTEST_MODES = (BACKTEST_MODE_L1, BACKTEST_MODE_L2, BACKTEST_MODE_L3)


STRATEGY_REGISTRY: dict[str, dict[str, Any]] = {
    "rl_sb3_market": {
        "strategy_path": "training.rl_strategy:RLSb3Strategy",
        "config_path": "training.rl_strategy:RLSb3StrategyConfig",
        "config": {},
    },
    "ema_trend": {
        "strategy_path": "training.strategies.ema_trend:EmaTrendStrategy",
        "config_path": "training.strategies.ema_trend:EmaTrendStrategyConfig",
        "config": {
            "ema_fast": 20,
            "ema_slow": 100,
            "atr_period": 14,
            "stop_atr_mult": 1.5,
            "take_profit_atr_mult": 3.0,
        },
    },
    "bollinger_mean_rev": {
        "strategy_path": "training.strategies.bollinger_rev:BollingerMeanRevStrategy",
        "config_path": "training.strategies.bollinger_rev:BollingerMeanRevStrategyConfig",
        "config": {
            "bb_period": 20,
            "bb_std": 2.0,
            "rsi_period": 14,
            "rsi_long_threshold": 30.0,
            "rsi_short_threshold": 70.0,
        },
    },
    "funding_overlay": {
        "strategy_path": "training.strategies.funding_overlay:FundingOverlayStrategy",
        "config_path": "training.strategies.funding_overlay:FundingOverlayStrategyConfig",
        "config": {
            "funding_threshold_positive": 0.0001,
            "funding_threshold_negative": -0.0001,
            "exposure_reduction_factor": 0.5,
        },
    },
}

VENUE_REGISTRY: dict[str, dict[str, Any]] = {
    "bingx_margin": {
        "name": "BINGX",
        "oms_type": OmsType.HEDGING,
        "account_type": AccountType.MARGIN,
        "starting_balances": ["100000 USDT"],
    },
    "bybit_margin": {
        "name": "BYBIT",
        "oms_type": OmsType.HEDGING,
        "account_type": AccountType.MARGIN,
        "starting_balances": ["100000 USDT"],
    },
    "okx_margin": {
        "name": "OKX",
        "oms_type": OmsType.HEDGING,
        "account_type": AccountType.MARGIN,
        "starting_balances": ["100000 USDT"],
    },
}


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


def _resolve_requested_ids(
    requested_ids: list[str] | None,
    registry: Mapping[str, Any],
    *,
    kind: str,
) -> list[str]:
    if not requested_ids:
        return list(registry.keys())

    deduped: list[str] = []
    seen: set[str] = set()
    for raw_value in requested_ids:
        normalized = str(raw_value).strip().lower()
        if not normalized:
            continue
        if normalized in {"*", "all"}:
            return list(registry.keys())
        if normalized not in registry:
            allowed = ", ".join(sorted(registry.keys()))
            raise ValueError(f"Unsupported {kind}_id '{normalized}'. Allowed: {allowed}")
        if normalized in seen:
            continue
        seen.add(normalized)
        deduped.append(normalized)
    if not deduped:
        return list(registry.keys())
    return deduped


def _resolve_bar_spec(interval: str) -> BarSpecification:
    if interval.endswith("m"):
        return BarSpecification(int(interval[:-1]), BarAggregation.MINUTE, PriceType.LAST)
    if interval.endswith("h"):
        return BarSpecification(int(interval[:-1]), BarAggregation.HOUR, PriceType.LAST)
    return BarSpecification(1, BarAggregation.MINUTE, PriceType.LAST)


def run_backtest(
    pair: str,
    interval: str,
    features: list[dict],
    model_path: str,
    window_size: int,
    decision_threshold: float,
    instrument_meta: dict | None = None,
    strategy_ids: list[str] | None = None,
    venue_ids: list[str] | None = None,
    backtest_mode: str = BACKTEST_MODE_L1,
) -> list[MatrixBacktestResult]:
    if backtest_mode not in BACKTEST_MODES:
        raise ValueError(f"backtest_mode must be one of {BACKTEST_MODES}, got {backtest_mode!r}")
    # L2/L3 require continuous order book capture; currently we run L1 only
    resolved_strategy_ids = _resolve_requested_ids(strategy_ids, STRATEGY_REGISTRY, kind="strategy")
    resolved_venue_ids = _resolve_requested_ids(venue_ids, VENUE_REGISTRY, kind="venue")
    price_precision, size_precision, _, _ = _resolve_instrument_meta(instrument_meta)
    bar_spec = _resolve_bar_spec(interval)
    matrix_results: list[MatrixBacktestResult] = []

    for venue_id in resolved_venue_ids:
        venue_spec = VENUE_REGISTRY[venue_id]
        instrument = _build_instrument(pair, instrument_meta=instrument_meta, venue=str(venue_spec["name"]))
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

            venue_config = BacktestVenueConfig(
                name=str(venue_spec["name"]),
                oms_type=venue_spec["oms_type"],
                account_type=venue_spec["account_type"],
                starting_balances=list(venue_spec["starting_balances"]),
            )
            data_config = BacktestDataConfig(
                catalog_path=tmpdir,
                data_cls="nautilus_trader.model.data:Bar",
                instrument_id=instrument.id,
                bar_spec=str(bar_spec),
            )

            for strategy_id in resolved_strategy_ids:
                strategy_spec = STRATEGY_REGISTRY[strategy_id]
                base_config: dict[str, Any] = {
                    "instrument_id": instrument.id,
                    "bar_type": str(bar_type),
                    "trade_size": _format_decimal(1.0, size_precision),
                    **(strategy_spec.get("config", {}) or {}),
                }
                if strategy_id == "rl_sb3_market":
                    base_config["model_path"] = model_path
                    base_config["decision_threshold"] = decision_threshold
                    base_config["window_size"] = window_size
                strategy_config = ImportableStrategyConfig(
                    strategy_path=str(strategy_spec["strategy_path"]),
                    config_path=str(strategy_spec["config_path"]),
                    config=base_config,
                )

                run_config = BacktestRunConfig(
                    venues=[venue_config],
                    data=[data_config],
                    engine=BacktestEngineConfig(strategies=[strategy_config]),
                    raise_exception=True,
                )
                node = BacktestNode([run_config])
                try:
                    results = node.run()
                except Exception as exc:
                    raise RuntimeError("Nautilus backtest failed") from exc
                if not results:
                    raise RuntimeError("Nautilus backtest produced no results")

                matrix_results.append(
                    MatrixBacktestResult(
                        strategy_id=strategy_id,
                        venue_id=venue_id,
                        venue_name=str(venue_spec["name"]),
                        result=results[0],
                    )
                )

    return matrix_results
