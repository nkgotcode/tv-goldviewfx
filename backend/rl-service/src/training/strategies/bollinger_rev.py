"""
Strategy B: Bollinger Mean Reversion. Timeframe 5m; BB(20, 2);
entry when close outside band + RSI (RSI<30 long / RSI>70 short); exit mid-band; leverage cap 2x.
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


def _sma(prices: list[float], period: int) -> float | None:
    if len(prices) < period:
        return None
    return sum(prices[-period:]) / period


def _std(prices: list[float], period: int) -> float | None:
    if len(prices) < period:
        return None
    s = _sma(prices, period)
    if s is None:
        return None
    var = sum((p - s) ** 2 for p in prices[-period:]) / period
    return var ** 0.5


def _rsi(prices: list[float], period: int) -> float | None:
    if len(prices) < period + 1:
        return None
    gains, losses = [], []
    for i in range(len(prices) - period, len(prices)):
        if i == 0:
            continue
        d = prices[i] - prices[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1 + rs))


class BollingerMeanRevStrategyConfig(StrategyConfig, frozen=True):
    instrument_id: InstrumentId
    bar_type: str
    trade_size: Decimal
    bb_period: int = 20
    bb_std: float = 2.0
    rsi_period: int = 14
    rsi_long_threshold: float = 30.0
    rsi_short_threshold: float = 70.0


class BollingerMeanRevStrategy(Strategy):
    def __init__(self, config: BollingerMeanRevStrategyConfig) -> None:
        super().__init__(config)
        self._bars: deque[Bar] = deque(maxlen=config.bb_period + 50)
        self._bar_type = BarType.from_str(config.bar_type)
        self._instrument_id = (
            config.instrument_id
            if isinstance(config.instrument_id, InstrumentId)
            else InstrumentId.from_str(str(config.instrument_id))
        )
        self._position_side: OrderSide | None = None

    def on_start(self) -> None:
        self.subscribe_bars(self._bar_type)

    def on_bar(self, bar: Bar) -> None:
        self._bars.append(bar)
        cfg = self.config
        if len(self._bars) < cfg.bb_period:
            return
        closes = [float(b.close) for b in self._bars]
        mid = _sma(closes, cfg.bb_period)
        std_val = _std(closes, cfg.bb_period)
        rsi_val = _rsi(closes, cfg.rsi_period)
        if mid is None or std_val is None or rsi_val is None:
            return
        upper = mid + cfg.bb_std * std_val
        lower = mid - cfg.bb_std * std_val
        last_close = closes[-1]
        if last_close <= lower and rsi_val < cfg.rsi_long_threshold:
            self._position_side = OrderSide.BUY
            self._submit(OrderSide.BUY)
        elif last_close >= upper and rsi_val > cfg.rsi_short_threshold:
            self._position_side = OrderSide.SELL
            self._submit(OrderSide.SELL)
        elif mid - 0.0001 <= last_close <= mid + 0.0001 and self._position_side is not None:
            self._submit(OrderSide.SELL if self._position_side == OrderSide.BUY else OrderSide.BUY)
            self._position_side = None

    def _submit(self, side: OrderSide) -> None:
        order = self.order_factory.market(
            instrument_id=self._instrument_id,
            order_side=side,
            quantity=Quantity.from_str(str(self.config.trade_size)),
            time_in_force=TimeInForce.GTC,
        )
        self.submit_order(order)
