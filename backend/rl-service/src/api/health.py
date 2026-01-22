from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter

from config import load_config
from schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    config = load_config()
    return HealthResponse(status="ok", environment=config.environment, timestamp=datetime.utcnow())
