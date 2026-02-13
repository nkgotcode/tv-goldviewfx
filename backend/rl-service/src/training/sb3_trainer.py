from __future__ import annotations

import base64
import tempfile
from dataclasses import dataclass
from hashlib import sha256

import numpy as np

from envs.market_env import MarketWindowEnv
from features.extractors import FEATURE_KEYS


@dataclass(frozen=True)
class TrainingConfig:
    timesteps: int
    seed: int | None = None


@dataclass(frozen=True)
class TrainingResult:
    artifact_base64: str
    artifact_checksum: str
    artifact_size_bytes: int
    algorithm_label: str
    hyperparameter_summary: str


def train_policy(windows: list[list[dict]], config: TrainingConfig) -> TrainingResult:
    try:
        from stable_baselines3 import PPO
    except Exception as exc:  # pragma: no cover - optional dependency guard
        raise RuntimeError("stable-baselines3 is required for training") from exc

    env = MarketWindowEnv(windows=windows, feature_keys=FEATURE_KEYS)
    model = PPO("MlpPolicy", env, verbose=0, seed=config.seed)
    model.learn(total_timesteps=config.timesteps)

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=True) as handle:
        model.save(handle.name)
        handle.seek(0)
        payload = handle.read()

    checksum = sha256(payload).hexdigest()
    encoded = base64.b64encode(payload).decode("utf-8")
    return TrainingResult(
        artifact_base64=encoded,
        artifact_checksum=checksum,
        artifact_size_bytes=len(payload),
        algorithm_label="PPO",
        hyperparameter_summary=f"timesteps={config.timesteps}",
    )
