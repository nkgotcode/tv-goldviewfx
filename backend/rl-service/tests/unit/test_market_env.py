import numpy as np

from envs.market_env import MarketWindowEnv
from features.extractors import FEATURE_KEYS


def _windows():
    windows = []
    for idx in range(4):
        window = []
        for offset in range(3):
            price = 2000 + idx + offset
            window.append(
                {
                    "timestamp": f"2024-01-01T00:{idx}{offset}:00Z",
                    "open": price,
                    "high": price + 1,
                    "low": price - 1,
                    "close": price + 0.5,
                    "volume": 100 + offset,
                }
            )
        windows.append(window)
    return windows


def test_env_reset_and_step_shapes():
    env = MarketWindowEnv(windows=_windows(), feature_keys=FEATURE_KEYS)
    observation, _ = env.reset()

    assert isinstance(observation, np.ndarray)
    assert observation.shape[0] == len(FEATURE_KEYS)

    next_obs, reward, terminated, truncated, _ = env.step(np.array([0.5], dtype=np.float32))
    assert next_obs.shape[0] == len(FEATURE_KEYS)
    assert isinstance(reward, float)
    assert terminated is False
    assert truncated is False
