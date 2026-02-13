import base64
import builtins
from hashlib import sha256

import pytest

from training.sb3_trainer import TrainingConfig, train_policy


def _windows(window_count: int = 4, window_size: int = 3) -> list[list[dict]]:
    windows: list[list[dict]] = []
    for idx in range(window_count):
        window: list[dict] = []
        for offset in range(window_size):
            price = 2000 + idx + (offset * 0.1)
            window.append(
                {
                    "timestamp": f"2024-01-01T00:{idx}{offset}:00Z",
                    "open": price,
                    "high": price + 0.5,
                    "low": price - 0.5,
                    "close": price + 0.2,
                    "volume": 100 + offset,
                }
            )
        windows.append(window)
    return windows


def test_train_policy_requires_sb3(monkeypatch):
    original_import = builtins.__import__

    def _blocked_import(name, *args, **kwargs):
        if name == "stable_baselines3":
            raise ImportError("blocked")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", _blocked_import)

    with pytest.raises(RuntimeError, match="stable-baselines3 is required for training"):
        train_policy(_windows(), TrainingConfig(timesteps=1, seed=1))


def test_train_policy_artifact_roundtrip():
    pytest.importorskip("stable_baselines3")

    result = train_policy(_windows(), TrainingConfig(timesteps=5, seed=7))
    payload = base64.b64decode(result.artifact_base64)

    assert result.algorithm_label == "PPO"
    assert result.artifact_size_bytes == len(payload)
    assert sha256(payload).hexdigest() == result.artifact_checksum

    from models.registry import load_sb3_model_from_bytes

    model = load_sb3_model_from_bytes(payload)
    assert model is not None
