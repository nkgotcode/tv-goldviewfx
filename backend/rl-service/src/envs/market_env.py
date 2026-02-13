from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np

try:  # pragma: no cover - optional dependency guard
    import gymnasium as gym
except Exception as exc:  # pragma: no cover
    raise RuntimeError("gymnasium is required for RL environments") from exc


@dataclass
class WindowFeatures:
    observation: np.ndarray
    current_close: float
    next_close: float


def _compute_window_features(window: list[dict], feature_keys: Iterable[str]) -> WindowFeatures:
    if not window:
        zeros = np.zeros(len(list(feature_keys)), dtype=np.float32)
        return WindowFeatures(observation=zeros, current_close=0.0, next_close=0.0)

    first = window[0]
    last = window[-1]
    current_close = float(last.get("close", 0.0))
    next_close = current_close

    first_price = float(first.get("open", current_close or 0.0))
    price_change = (current_close - first_price) / first_price if first_price else 0.0
    volatility = float(np.std([float(item.get("close", 0.0)) for item in window])) if len(window) > 1 else 0.0
    volume_avg = float(np.mean([float(item.get("volume", 0.0)) for item in window])) if window else 0.0

    values = {
        "last_price": current_close,
        "price_change": price_change,
        "volatility": volatility,
        "volume_avg": volume_avg,
        "spread": 0.0,
        "ideas_score": 0.0,
        "signals_score": 0.0,
        "news_score": 0.0,
        "ocr_score": 0.0,
        "news_confidence_avg": 0.0,
        "ocr_confidence_avg": 0.0,
        "ocr_text_length_avg": 0.0,
        "aux_score": 0.0,
    }

    observation = np.array([float(values.get(key, 0.0)) for key in feature_keys], dtype=np.float32)
    return WindowFeatures(observation=observation, current_close=current_close, next_close=next_close)


class MarketWindowEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, windows: list[list[dict]], feature_keys: list[str]):
        super().__init__()
        if not windows:
            raise ValueError("windows must not be empty")
        self._windows = windows
        self._feature_keys = feature_keys
        self._index = 0
        self._last_close = float(windows[0][-1].get("close", 0.0))

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
        self._last_close = float(self._windows[0][-1].get("close", 0.0))
        features = _compute_window_features(self._windows[self._index], self._feature_keys)
        return features.observation, {}

    def step(self, action: np.ndarray):
        score = float(action[0]) if action is not None else 0.0
        current_window = self._windows[self._index]
        features = _compute_window_features(current_window, self._feature_keys)
        current_close = features.current_close

        self._index += 1
        done = self._index >= len(self._windows)
        if done:
            return features.observation, 0.0, True, False, {}

        next_window = self._windows[self._index]
        next_close = float(next_window[-1].get("close", current_close))

        price_delta = next_close - current_close
        reward = score * price_delta
        self._last_close = next_close

        next_features = _compute_window_features(next_window, self._feature_keys)
        return next_features.observation, reward, False, False, {}
