from __future__ import annotations

from fastapi import APIRouter, HTTPException

from data.dataset_builder import build_dataset
from schemas import TrainingRequest, TrainingResponse
from training.sb3_trainer import TrainingConfig, train_policy

router = APIRouter()


@router.post("/training/run", response_model=TrainingResponse)
def run_training(payload: TrainingRequest) -> TrainingResponse:
    try:
        if not payload.dataset_features:
            raise HTTPException(status_code=400, detail="dataset_features are required for training")

        result = build_dataset(
            payload.dataset_features,
            window_size=payload.window_size,
            stride=payload.stride,
            metadata={
                "pair": payload.pair,
                "interval": "1m",
                "start_at": payload.period_start,
                "end_at": payload.period_end,
                "feature_schema_fingerprint": payload.feature_schema_fingerprint,
            },
        )

        windows = result["windows"]
        if not windows:
            raise HTTPException(status_code=400, detail="No training windows generated")

        training_result = train_policy(
            windows,
            TrainingConfig(
                timesteps=payload.timesteps,
                seed=payload.seed,
                leverage=payload.leverage,
                taker_fee_bps=payload.taker_fee_bps,
                slippage_bps=payload.slippage_bps,
                funding_weight=payload.funding_weight,
                drawdown_penalty=payload.drawdown_penalty,
                feedback_rounds=payload.feedback_rounds,
                feedback_timesteps=payload.feedback_timesteps,
                feedback_hard_ratio=payload.feedback_hard_ratio,
            ),
        )

        return TrainingResponse(
            artifact_base64=training_result.artifact_base64,
            artifact_checksum=training_result.artifact_checksum,
            artifact_size_bytes=training_result.artifact_size_bytes,
            algorithm_label=training_result.algorithm_label,
            hyperparameter_summary=training_result.hyperparameter_summary,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
