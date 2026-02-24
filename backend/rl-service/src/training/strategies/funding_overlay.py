"""
Strategy C: Funding-aware overlay. Reduce exposure against dominant funding:
high positive funding → prefer shorts; high negative funding → prefer longs.
Uses funding_rate from bar metadata if available; otherwise flat.
"""

from __future__ import annotations

from collections import deque
from decimal import Decimal

from nautilus_trader.config import StrategyConfig
from nautilus_trader.model.data import Bar, BarType
from nautilus_trader.model.enums import OrderSide, TimeInForce
from nautilus_trader.model.identifiers import InstrumentId
from nautilus_trader.model.objects import Quantity
from nautilus_trader.trading.strategy import Strategy


class FundingOverlayStrategyConfig(StrategyConfig, frozen=True):
    instrument_id: InstrumentId
    bar_type: str
    trade_size: Decimal
    funding_threshold_positive: float = 0.0001
    funding_threshold_negative: float = -0.0001
    exposure_reduction_factor: float = 0.5


class FundingOverlayStrategy(Strategy):
    def __init__(self, config: FundingOverlayStrategyConfig) -> None:
        super().__init__(config)
        self._bars: deque[Bar] = deque(maxlen=100)
        self._bar_type = BarType.from_str(config.bar_type)
        self._instrument_id = (
            config.instrument_id
            if isinstance(config.instrument_id, InstrumentId)
            else InstrumentId.from_str(str(config.instrument_id))
        )

    def on_start(self) -> None:
        self.subscribe_bars(self._bar_type)

    def on_bar(self, bar: Bar) -> None:
        self._bars.append(bar)
        cfg = self.config
        funding_rate = 0.0
        if hasattr(bar, "metadata") and isinstance(getattr(bar, "metadata", None), dict):
            funding_rate = float(bar.metadata.get("funding_rate", 0.0))
        if funding_rate >= cfg.funding_threshold_positive:
            self._submit(OrderSide.SELL, cfg.exposure_reduction_factor)
        elif funding_rate <= cfg.funding_threshold_negative:
            self._submit(OrderSide.BUY, cfg.exposure_reduction_factor)

    def _submit(self, side: OrderSide, size_scale: float = 1.0) -> None:
        qty = float(self.config.trade_size) * size_scale
        if qty <= 0:
            return
        order = self.order_factory.market(
            instrument_id=self._instrument_id,
            order_side=side,
            quantity=Quantity.from_str(f"{qty:.8f}".rstrip("0").rstrip(".")),
            time_in_force=TimeInForce.GTC,
        )
        self.submit_order(order)
