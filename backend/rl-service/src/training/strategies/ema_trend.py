"""
Strategy A: EMA Trend (bar-based). Timeframe 1m; EMA fast 20, slow 100;
stop 1.5×ATR(14), take profit 3.0×ATR(14); risk 2% equity per trade.
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


def _ema(prices: list[float], period: int) -> float | None:
    if len(prices) < period:
        return None
    k = 2.0 / (period + 1)
    ema_val = sum(prices[:period]) / period
    for p in prices[period:]:
        ema_val = p * k + ema_val * (1 - k)
    return ema_val


def _atr(highs: list[float], lows: list[float], closes: list[float], period: int) -> float | None:
    if len(closes) < period + 1:
        return None
    trs = []
    for i in range(1, len(closes)):
        hl = highs[i] - lows[i]
        hc = abs(highs[i] - closes[i - 1])
        lc = abs(lows[i] - closes[i - 1])
        trs.append(max(hl, hc, lc))
    if len(trs) < period:
        return None
    return sum(trs[-period:]) / period


class EmaTrendStrategyConfig(StrategyConfig, frozen=True):
    instrument_id: InstrumentId
    bar_type: str
    trade_size: Decimal
    ema_fast: int = 20
    ema_slow: int = 100
    atr_period: int = 14
    stop_atr_mult: float = 1.5
    take_profit_atr_mult: float = 3.0


class EmaTrendStrategy(Strategy):
    def __init__(self, config: EmaTrendStrategyConfig) -> None:
        super().__init__(config)
        self._bars: deque[Bar] = deque(maxlen=config.ema_slow + 50)
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
        if len(self._bars) < cfg.ema_slow:
            return
        closes = [float(b.close) for b in self._bars]
        highs = [float(b.high) for b in self._bars]
        lows = [float(b.low) for b in self._bars]
        ema_f = _ema(closes, cfg.ema_fast)
        ema_s = _ema(closes, cfg.ema_slow)
        atr_val = _atr(highs, lows, closes, cfg.atr_period)
        if ema_f is None or ema_s is None or atr_val is None or atr_val <= 0:
            return
        last_close = closes[-1]
        if last_close > ema_f > ema_s:
            self._submit(OrderSide.BUY)
        elif last_close < ema_f < ema_s:
            self._submit(OrderSide.SELL)

    def _submit(self, side: OrderSide) -> None:
        order = self.order_factory.market(
            instrument_id=self._instrument_id,
            order_side=side,
            quantity=Quantity.from_str(str(self.config.trade_size)),
            time_in_force=TimeInForce.GTC,
        )
        self.submit_order(order)
