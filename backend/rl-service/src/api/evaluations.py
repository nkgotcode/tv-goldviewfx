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
            dataset_features=payload.dataset_features,
            artifact_base64=payload.artifact_base64,
            artifact_download_url=payload.artifact_download_url,
            artifact_checksum=payload.artifact_checksum,
            artifact_uri=payload.artifact_uri,
            decision_threshold=payload.decision_threshold or 0.2,
            window_size=payload.window_size,
            stride=payload.stride,
            leverage=payload.leverage,
            taker_fee_bps=payload.taker_fee_bps,
            slippage_bps=payload.slippage_bps,
            funding_weight=payload.funding_weight,
            drawdown_penalty=payload.drawdown_penalty,
            walk_forward=payload.walk_forward,
            feature_schema_fingerprint=payload.feature_schema_fingerprint,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
