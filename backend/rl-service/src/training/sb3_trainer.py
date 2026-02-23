from __future__ import annotations

import base64
import tempfile
from dataclasses import dataclass
from hashlib import sha256

import numpy as np

from envs.market_env import MarketWindowEnv
from features.extractors import resolve_feature_keys


@dataclass(frozen=True)
class TrainingConfig:
    timesteps: int
    seed: int | None = None
    leverage: float = 1.0
    taker_fee_bps: float = 0.0
    slippage_bps: float = 0.0
    funding_weight: float = 1.0
    drawdown_penalty: float = 0.0
    feedback_rounds: int = 0
    feedback_timesteps: int = 256
    feedback_hard_ratio: float = 0.3
    feature_key_extras: list[str] | None = None


@dataclass(frozen=True)
class TrainingResult:
    artifact_base64: str
    artifact_checksum: str
    artifact_size_bytes: int
    algorithm_label: str
    hyperparameter_summary: str


def _build_env(windows: list[list[dict]], config: TrainingConfig) -> MarketWindowEnv:
    feature_keys = resolve_feature_keys(config.feature_key_extras)
    return MarketWindowEnv(
        windows=windows,
        feature_keys=feature_keys,
        leverage=config.leverage,
        taker_fee_bps=config.taker_fee_bps,
        slippage_bps=config.slippage_bps,
        funding_weight=config.funding_weight,
        drawdown_penalty=config.drawdown_penalty,
    )


def _select_hard_windows(model, windows: list[list[dict]], config: TrainingConfig) -> list[list[dict]]:
    if len(windows) < 3:
        return windows
    eval_env = _build_env(windows, config)
    observation, _ = eval_env.reset()
    rewards: list[tuple[int, float]] = []
    for idx in range(len(windows) - 1):
        action, _ = model.predict(observation, deterministic=True)
        action_arr = np.array(action, dtype=np.float32).reshape(-1)
        observation, reward, terminated, truncated, _ = eval_env.step(action_arr)
        rewards.append((idx, float(reward)))
        if terminated or truncated:
            break
    if not rewards:
        return windows

    hard_ratio = min(1.0, max(0.0, float(config.feedback_hard_ratio)))
    hard_count = max(1, int(np.ceil(len(rewards) * hard_ratio)))
    hardest_indices = [idx for idx, _ in sorted(rewards, key=lambda item: item[1])[:hard_count]]
    include_indices = set()
    for idx in hardest_indices:
        include_indices.add(idx)
        if idx + 1 < len(windows):
            include_indices.add(idx + 1)
    ordered = sorted(include_indices)
    selected = [windows[idx] for idx in ordered]
    return selected if len(selected) >= 2 else windows


def train_policy(windows: list[list[dict]], config: TrainingConfig) -> TrainingResult:
    try:
        from stable_baselines3 import PPO
    except Exception as exc:  # pragma: no cover - optional dependency guard
        raise RuntimeError("stable-baselines3 is required for training") from exc

    env = _build_env(windows, config)
    model = PPO("MlpPolicy", env, verbose=0, seed=config.seed)
    model.learn(total_timesteps=max(1, int(config.timesteps)))

    feedback_rounds = max(0, int(config.feedback_rounds))
    feedback_timesteps = max(1, int(config.feedback_timesteps))
    for _ in range(feedback_rounds):
        hard_windows = _select_hard_windows(model, windows, config)
        if len(hard_windows) < 2:
            break
        hard_env = _build_env(hard_windows, config)
        model.set_env(hard_env)
        model.learn(total_timesteps=feedback_timesteps, reset_num_timesteps=False)

    model.set_env(env)

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
        hyperparameter_summary=(
            f"timesteps={config.timesteps},"
            f"leverage={config.leverage},"
            f"taker_fee_bps={config.taker_fee_bps},"
            f"slippage_bps={config.slippage_bps},"
            f"funding_weight={config.funding_weight},"
            f"drawdown_penalty={config.drawdown_penalty},"
            f"feedback_rounds={feedback_rounds},"
            f"feedback_timesteps={feedback_timesteps},"
            f"feedback_hard_ratio={config.feedback_hard_ratio}"
        ),
    )
