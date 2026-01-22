from __future__ import annotations

from fastapi import APIRouter, HTTPException

from monitoring.drift import check_drift
from schemas import DriftCheckRequest, DriftCheckResponse

router = APIRouter()


@router.post("/monitoring/drift", response_model=DriftCheckResponse)
def drift_check(payload: DriftCheckRequest) -> DriftCheckResponse:
    if payload.threshold < 0:
        raise HTTPException(status_code=400, detail="threshold must be non-negative")
    result = check_drift(payload.baseline_value, payload.current_value, payload.threshold)
    return DriftCheckResponse(
        drifted=bool(result["drifted"]),
        metric=payload.metric,
        baseline_value=payload.baseline_value,
        current_value=payload.current_value,
        delta=float(result["delta"]),
    )
