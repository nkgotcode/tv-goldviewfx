from __future__ import annotations

from fastapi import APIRouter, HTTPException

from schemas import EvaluationReport, EvaluationRequest
from training.evaluation import run_evaluation

router = APIRouter()


@router.post("/evaluations", response_model=EvaluationReport)
def run_evaluation_endpoint(payload: EvaluationRequest) -> EvaluationReport:
    try:
        return run_evaluation(
            pair=payload.pair,
            period_start=payload.period_start,
            period_end=payload.period_end,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
