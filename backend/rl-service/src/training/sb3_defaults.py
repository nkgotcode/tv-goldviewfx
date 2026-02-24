"""
SB3 algorithm defaults: SAC (continuous actions).
Remove PPO as default; use SAC with the following hyperparameters.
"""

from __future__ import annotations

# SAC defaults (institutional spec 7.3)
SAC_BUFFER_SIZE = 1_000_000
SAC_BATCH_SIZE = 256
SAC_GAMMA = 0.999
SAC_TAU = 0.005
SAC_LEARNING_RATE = 3e-4

# Optional overrides for discrete policy (e.g. when using Discrete(3) with SAC, some impls use a different wrapper)
USE_DISCRETE_ACTION_ENV = True  # Prefer MarketWindowDiscreteEnv; SAC may need MultiInputPolicy or custom

def sac_kwargs(overrides: dict | None = None) -> dict:
    base = {
        "buffer_size": SAC_BUFFER_SIZE,
        "batch_size": SAC_BATCH_SIZE,
        "gamma": SAC_GAMMA,
        "tau": SAC_TAU,
        "learning_rate": SAC_LEARNING_RATE,
    }
    if overrides:
        base.update(overrides)
    return base
