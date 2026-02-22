from __future__ import annotations

from fastapi import APIRouter, HTTPException

from config import load_config
from features.extractors import extract_features, vectorize_features
from models.action_mapper import map_action
from models.artifact_loader import decode_base64, fetch_artifact
from models.registry import ModelMetadata, ModelRegistry
from schemas import InferenceRequest, InferenceResponse, TradeDecision

router = APIRouter()
registry = ModelRegistry()


def _apply_risk_limits(decision: TradeDecision, request: InferenceRequest) -> tuple[TradeDecision, list[str]]:
    warnings: list[str] = []
    if request.risk_limits:
        if request.risk_limits.max_open_positions <= 0 or request.risk_limits.max_position_size <= 0:
            warnings.append("risk_limits_blocked")
            decision.action = "hold"
            decision.risk_check_result = "fail"
    return decision, warnings


@router.post("/inference", response_model=InferenceResponse)
def run_inference(payload: InferenceRequest) -> InferenceResponse:
    config = load_config()
    strict_model_inference = config.strict_model_inference
    features = extract_features(payload.market, payload.ideas, payload.signals, payload.news, payload.ocr)
    warnings: list[str] = []

    decision: TradeDecision
    model_version = payload.policy_version
    has_model_payload = bool(payload.policy_version and (payload.artifact_base64 or payload.artifact_download_url))

    if strict_model_inference and not has_model_payload:
        raise HTTPException(
            status_code=400,
            detail="Strict inference requires policy_version and artifact payload",
        )

    if payload.policy_version and (
        payload.artifact_base64 or payload.artifact_download_url
    ):
        try:
            if payload.artifact_base64:
                artifact = decode_base64(payload.artifact_base64)
            else:
                artifact = fetch_artifact(
                    payload.artifact_download_url,
                    expected_checksum=payload.artifact_checksum,
                )
            metadata = ModelMetadata(
                version_id=payload.policy_version,
                artifact_uri=payload.artifact_uri,
                artifact_checksum=payload.artifact_checksum or artifact.checksum,
                artifact_size_bytes=len(artifact.data),
            )
            model = registry.ensure_loaded(
                payload.policy_version,
                payload=artifact.data,
                metadata=metadata,
            )
            import numpy as np

            obs = np.array(vectorize_features(features), dtype=float)
            action, _ = model.predict(obs, deterministic=True)
            try:
                score = float(action)
            except (TypeError, ValueError):
                score = float(np.array(action).reshape(-1)[0])
        except Exception as exc:
            if strict_model_inference:
                raise HTTPException(status_code=500, detail=f"Model inference failed: {exc}") from exc
            warnings.append(f"model_inference_failed:{exc}")
            score = features.get("aux_score", 0.0) + (features.get("price_change", 0.0) * 0.5)
    else:
        if strict_model_inference:
            raise HTTPException(
                status_code=400,
                detail="Strict inference requires policy_version and artifact payload",
            )
        warnings.append("model_unavailable")
        score = features.get("aux_score", 0.0) + (features.get("price_change", 0.0) * 0.5)

    decision = map_action(score)
    decision, warnings = _apply_risk_limits(decision, payload)

    if not payload.learning_enabled:
        warnings.append("learning_disabled")

    return InferenceResponse(decision=decision, features=features, warnings=warnings, model_version=model_version)
