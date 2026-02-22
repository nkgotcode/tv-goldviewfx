from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from config import load_config
from schemas import HealthResponse

router = APIRouter()


def _module_available(module: str) -> bool:
    try:
        __import__(module)
        return True
    except Exception:
        return False


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    config = load_config()
    ml_dependencies = {
        "stable_baselines3": _module_available("stable_baselines3"),
        "nautilus_trader": _module_available("nautilus_trader"),
    }
    if config.health_require_ml and not all(ml_dependencies.values()):
        raise HTTPException(status_code=503, detail={"error": "ml_dependencies_missing", "ml_dependencies": ml_dependencies})

    return HealthResponse(
        status="ok",
        environment=config.environment,
        ml_dependencies=ml_dependencies,
        strict_model_inference=config.strict_model_inference,
        strict_backtest=config.strict_backtest,
        timestamp=datetime.now(timezone.utc),
    )
