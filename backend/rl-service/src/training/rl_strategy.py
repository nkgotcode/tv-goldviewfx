from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from decimal import Decimal

import numpy as np

from features.extractors import extract_features, vectorize_features
from nautilus_trader.config import StrategyConfig
from nautilus_trader.model.data import Bar, BarType
from nautilus_trader.model.enums import OrderSide, TimeInForce
from nautilus_trader.model.identifiers import InstrumentId
from nautilus_trader.model.objects import Quantity
from nautilus_trader.trading.strategy import Strategy
from schemas import MarketCandle, MarketSnapshot


class RLSb3StrategyConfig(StrategyConfig, frozen=True):
    instrument_id: InstrumentId
    bar_type: str
    trade_size: Decimal
    model_path: str
    decision_threshold: float = 0.2
    window_size: int = 30


class RLSb3Strategy(Strategy):
    def __init__(self, config: RLSb3StrategyConfig) -> None:
        super().__init__(config)
        self._bars: deque[Bar] = deque(maxlen=config.window_size)
        self._model = None
        self._bar_type = BarType.from_str(config.bar_type)
        if isinstance(config.instrument_id, InstrumentId):
            self._instrument_id = config.instrument_id
        else:
            self._instrument_id = InstrumentId.from_str(str(config.instrument_id))

    def on_start(self) -> None:
        try:
            from stable_baselines3 import PPO
        except Exception as exc:  # pragma: no cover - optional dependency guard
            raise RuntimeError("stable-baselines3 is required for RL backtests") from exc
        self._model = PPO.load(self.config.model_path)
        self.subscribe_bars(self._bar_type)

    def on_bar(self, bar: Bar) -> None:
        self._bars.append(bar)
        if len(self._bars) < self.config.window_size:
            return

        snapshot = MarketSnapshot(
            pair=self._resolve_pair(),
            candles=[self._bar_to_candle(item) for item in self._bars],
            last_price=float(bar.close),
        )
        features = extract_features(snapshot, [], [], [], [])
        observation = np.array(vectorize_features(features), dtype=float)
        action, _ = self._model.predict(observation, deterministic=True)
        try:
            score = float(action)
        except (TypeError, ValueError):
            score = float(np.array(action).reshape(-1)[0])

        if score >= self.config.decision_threshold:
            self._submit_order(OrderSide.BUY)
        elif score <= -self.config.decision_threshold:
            self._submit_order(OrderSide.SELL)

    def _submit_order(self, side: OrderSide) -> None:
        order = self.order_factory.market(
            instrument_id=self._instrument_id,
            order_side=side,
            quantity=self._order_quantity(),
            time_in_force=TimeInForce.GTC,
        )
        self.submit_order(order)

    def _order_quantity(self) -> Quantity:
        return Quantity.from_str(str(self.config.trade_size))

    def _bar_to_candle(self, bar: Bar) -> MarketCandle:
        return MarketCandle(
            timestamp=self._to_datetime(bar.ts_event),
            open=float(bar.open),
            high=float(bar.high),
            low=float(bar.low),
            close=float(bar.close),
            volume=float(bar.volume),
        )

    def _to_datetime(self, ts_nanos: int) -> datetime:
        seconds = ts_nanos / 1_000_000_000
        return datetime.fromtimestamp(seconds, tz=timezone.utc)

    def _resolve_pair(self):
        value = str(self._instrument_id)
        if value.startswith("GOLDUSDT"):
            return "Gold-USDT"
        if value.startswith("XAUTUSDT"):
            return "XAUTUSDT"
        return "PAXGUSDT"
