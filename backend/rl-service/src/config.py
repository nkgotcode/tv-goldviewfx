from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class ServiceConfig:
    environment: str
    host: str
    port: int
    log_level: str
    request_timeout_ms: int
    model_registry_path: str
    artifact_bucket: str | None
    convex_url: str | None
    strict_model_inference: bool
    strict_backtest: bool
    health_require_ml: bool


def _get_int(env: dict[str, str], key: str, default: int) -> int:
    value = env.get(key)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"Invalid integer for {key}: {value}") from exc


def _get_bool(env: dict[str, str], key: str, default: bool) -> bool:
    value = env.get(key)
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off", ""}:
        return False
    raise ValueError(f"Invalid boolean for {key}: {value}")


def load_config(env: dict[str, str] | None = None) -> ServiceConfig:
    if env is None:
        env = os.environ
    return ServiceConfig(
        environment=env.get("RL_ENV", "development"),
        host=env.get("RL_SERVICE_HOST", "0.0.0.0"),
        port=_get_int(env, "RL_SERVICE_PORT", 9101),
        log_level=env.get("RL_SERVICE_LOG_LEVEL", "info"),
        request_timeout_ms=_get_int(env, "RL_SERVICE_REQUEST_TIMEOUT_MS", 15000),
        model_registry_path=env.get("RL_MODEL_REGISTRY_PATH", "./models"),
        artifact_bucket=env.get("RL_ARTIFACT_BUCKET"),
        convex_url=env.get("CONVEX_URL"),
        strict_model_inference=_get_bool(env, "RL_STRICT_MODEL_INFERENCE", True),
        strict_backtest=_get_bool(env, "RL_STRICT_BACKTEST", True),
        health_require_ml=_get_bool(env, "RL_HEALTH_REQUIRE_ML", True),
    )
