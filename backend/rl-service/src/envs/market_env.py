from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np
from features.technical_pipeline import build_feature_snapshot
from schemas import MarketSnapshot

try:  # pragma: no cover - optional dependency guard
    import gymnasium as gym
except Exception as exc:  # pragma: no cover
    raise RuntimeError("gymnasium is required for RL environments") from exc


@dataclass
class WindowFeatures:
    observation: np.ndarray
    current_close: float
    next_close: float
    funding_rate: float


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if np.isfinite(parsed):
        return parsed
    return default


def _window_futures_features(window: list[dict]) -> dict[str, float]:
    if not window:
        return {
            "funding_rate": 0.0,
            "funding_rate_annualized": 0.0,
            "open_interest": 0.0,
            "open_interest_delta_pct": 0.0,
            "mark_price": 0.0,
            "index_price": 0.0,
            "mark_index_basis_bps": 0.0,
            "ticker_last_price": 0.0,
            "ticker_price_change_24h": 0.0,
            "ticker_volume_24h": 0.0,
        }

    last = window[-1]
    first = window[0]
    funding_rate = _safe_float(last.get("funding_rate"), 0.0)
    open_interest = _safe_float(last.get("open_interest"), 0.0)
    first_open_interest = _safe_float(first.get("open_interest"), open_interest)
    open_interest_delta_pct = (open_interest - first_open_interest) / abs(first_open_interest) if first_open_interest else 0.0
    mark_price = _safe_float(last.get("mark_price"), 0.0)
    index_price = _safe_float(last.get("index_price"), mark_price)
    basis_bps = ((mark_price - index_price) / index_price) * 10_000 if index_price else 0.0
    ticker_last_price = _safe_float(last.get("ticker_last_price"), 0.0)
    return {
        "funding_rate": funding_rate,
        "funding_rate_annualized": _safe_float(last.get("funding_rate_annualized"), funding_rate * 3 * 365),
        "open_interest": open_interest,
        "open_interest_delta_pct": _safe_float(last.get("open_interest_delta_pct"), open_interest_delta_pct),
        "mark_price": mark_price,
        "index_price": index_price,
        "mark_index_basis_bps": _safe_float(last.get("mark_index_basis_bps"), basis_bps),
        "ticker_last_price": ticker_last_price,
        "ticker_price_change_24h": _safe_float(last.get("ticker_price_change_24h"), 0.0),
        "ticker_volume_24h": _safe_float(last.get("ticker_volume_24h"), 0.0),
    }


def _window_context_features(window: list[dict]) -> dict[str, float]:
    if not window:
        return {}
    last = window[-1]
    features: dict[str, float] = {}
    for key, value in last.items():
        if not isinstance(key, str) or not key.startswith("ctx_"):
            continue
        features[key] = _safe_float(value, 0.0)
    return features


def _compute_window_features(
    window: list[dict],
    feature_keys: Iterable[str],
    technical_config: dict | None = None,
) -> WindowFeatures:
    resolved_keys = list(feature_keys)
    if not window:
        zeros = np.zeros(len(resolved_keys), dtype=np.float32)
        return WindowFeatures(observation=zeros, current_close=0.0, next_close=0.0, funding_rate=0.0)

    last = window[-1]
    current_close = float(last.get("close", 0.0))
    next_close = current_close

    snapshot = MarketSnapshot(
        pair="Gold-USDT",
        candles=[
            {
                "timestamp": item.get("timestamp"),
                "open": float(item.get("open", 0.0)),
                "high": float(item.get("high", 0.0)),
                "low": float(item.get("low", 0.0)),
                "close": float(item.get("close", 0.0)),
                "volume": float(item.get("volume", 0.0)),
            }
            for item in window
        ],
        last_price=current_close,
        spread=0.0,
    )
    result = build_feature_snapshot(
        market=snapshot,  # pydantic coercion in pipeline
        technical_config=technical_config,
    )
    futures_features = _window_futures_features(window)
    context_features = _window_context_features(window)
    all_features = {**result.features, **futures_features, **context_features}
    keys = resolved_keys or result.feature_keys
    observation = np.array([float(all_features.get(key, 0.0)) for key in keys], dtype=np.float32)
    return WindowFeatures(
        observation=observation,
        current_close=current_close,
        next_close=next_close,
        funding_rate=float(futures_features.get("funding_rate", 0.0)),
    )


class MarketWindowEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(
        self,
        windows: list[list[dict]],
        feature_keys: list[str],
        leverage: float = 1.0,
        taker_fee_bps: float = 0.0,
        slippage_bps: float = 0.0,
        funding_weight: float = 1.0,
        drawdown_penalty: float = 0.0,
    ):
        super().__init__()
        if not windows:
            raise ValueError("windows must not be empty")
        self._windows = windows
        self._feature_keys = feature_keys
        self._index = 0
        self._last_close = _safe_float(windows[0][-1].get("close"), 0.0)
        self._leverage = max(0.0, float(leverage))
        self._taker_fee_rate = max(0.0, float(taker_fee_bps)) / 10_000.0
        self._slippage_rate = max(0.0, float(slippage_bps)) / 10_000.0
        self._funding_weight = max(0.0, float(funding_weight))
        self._drawdown_penalty = max(0.0, float(drawdown_penalty))
        self._prev_position = 0.0
        self._equity = 1.0
        self._equity_peak = 1.0

        self.action_space = gym.spaces.Box(low=-1.0, high=1.0, shape=(1,), dtype=np.float32)
        self.observation_space = gym.spaces.Box(
            low=-np.inf,
            high=np.inf,
            shape=(len(feature_keys),),
            dtype=np.float32,
        )

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        self._index = 0
        self._last_close = _safe_float(self._windows[0][-1].get("close"), 0.0)
        self._prev_position = 0.0
        self._equity = 1.0
        self._equity_peak = 1.0
        features = _compute_window_features(self._windows[self._index], self._feature_keys)
        return features.observation, {}

    def step(self, action: np.ndarray):
        score = float(action[0]) if action is not None else 0.0
        target_position = float(np.clip(score, -1.0, 1.0))
        current_window = self._windows[self._index]
        features = _compute_window_features(current_window, self._feature_keys)
        current_close = features.current_close

        self._index += 1
        done = self._index >= len(self._windows)
        if done:
            return features.observation, 0.0, True, False, {}

        next_window = self._windows[self._index]
        next_close = _safe_float(next_window[-1].get("close"), current_close)
        if current_close <= 0:
            reward = 0.0
            gross_pnl = 0.0
        else:
            pct_move = (next_close - current_close) / current_close
            gross_pnl = target_position * pct_move * self._leverage
            turnover = abs(target_position - self._prev_position)
            transaction_cost = turnover * (self._taker_fee_rate + self._slippage_rate)
            funding_cost = target_position * features.funding_rate * self._funding_weight * self._leverage
            step_pnl = gross_pnl - transaction_cost - funding_cost
            self._equity += step_pnl
            self._equity_peak = max(self._equity_peak, self._equity)
            drawdown = max(0.0, self._equity_peak - self._equity)
            reward = step_pnl - self._drawdown_penalty * drawdown
        self._prev_position = target_position
        self._last_close = next_close

        next_features = _compute_window_features(next_window, self._feature_keys)
        return next_features.observation, float(reward), False, False, {"gross_pnl": gross_pnl}
